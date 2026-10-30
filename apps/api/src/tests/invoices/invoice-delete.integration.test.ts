import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient, PrismaPg } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.INVOICE_DELETE_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Invoice deletion integration tests require local PostgreSQL.");
}

test(
  "invoice deletion preserves recorded and concurrent payments",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "invoice_delete_test").catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    try {
      const organization = await prisma.organization.create({ data: { name: "Invoice test", slug: isolated.schema } });
      const otherOrganization = await prisma.organization.create({
        data: { name: "Other", slug: `${isolated.schema}-other` },
      });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: "Test",
          line1: "1 Test Street",
          city: "Test",
          region: "IL",
          postalCode: "60000",
          unitCount: 1,
        },
      });
      const unit = await prisma.unit.create({ data: { propertyId: property.id, name: "1A", marketRateCents: 10_000 } });
      const tenant = await prisma.tenant.create({
        data: { organizationId: organization.id, firstName: "Test", lastName: "Tenant", email: "tenant@example.test" },
      });
      const lease = await prisma.lease.create({
        data: { organizationId: organization.id, propertyId: property.id, unitId: unit.id, allowPartialPayments: true },
      });
      await prisma.leaseTenant.create({
        data: { organizationId: organization.id, leaseId: lease.id, tenantId: tenant.id },
      });
      let month = 0;
      const createInvoice = async (balanceCents = 10_000) => {
        const dueOn = new Date(Date.UTC(2027, month++, 1));
        return prisma.invoice.create({
          data: {
            organizationId: organization.id,
            propertyId: property.id,
            leaseId: lease.id,
            tenantId: tenant.id,
            dueOn,
            periodStartsOn: dueOn,
            periodEndsOn: dueOn,
            amountCents: 10_000,
            balanceCents,
            recipients: { create: { tenantId: tenant.id } },
          },
        });
      };
      const createCaller = (client: unknown, organizationId = organization.id) =>
        appRouter.createCaller({
          prisma: client,
          session: { user: { id: 1, name: "Test administrator", role: "administrator" } },
          organization: { organizationId },
        } as unknown as Context);
      const caller = createCaller(prisma);
      const recordPayment = (id: number, amountCents: number) =>
        caller.invoices.recordPayment({
          id,
          amountCents,
          paidByTenantId: tenant.id,
          paidOn: new Date("2027-01-01"),
          paymentMethod: "check",
        });

      const unpaid = await createInvoice();
      assert.deepEqual(await caller.invoices.delete({ id: unpaid.id }), { id: unpaid.id });
      assert.equal(await prisma.invoice.findUnique({ where: { id: unpaid.id } }), null);

      const legacyPartial = await createInvoice(5_000);
      await assert.rejects(caller.invoices.delete({ id: legacyPartial.id }), { code: "BAD_REQUEST" });
      assert.ok(await prisma.invoice.findUnique({ where: { id: legacyPartial.id } }));

      for (const amountCents of [5_000, 10_000]) {
        const invoice = await createInvoice();
        const payment = await recordPayment(invoice.id, amountCents);
        await assert.rejects(caller.invoices.delete({ id: invoice.id }), { code: "BAD_REQUEST" });
        assert.ok(await prisma.invoice.findUnique({ where: { id: invoice.id } }));
        assert.ok(await prisma.invoicePayment.findUnique({ where: { id: payment.id } }));
      }

      const foreign = await createInvoice();
      const isMissingInvoice = (error: unknown) =>
        error instanceof TRPCError &&
        error.cause instanceof Prisma.PrismaClientKnownRequestError &&
        error.cause.code === "P2025";
      await assert.rejects(
        createCaller(prisma, otherOrganization.id).invoices.delete({ id: foreign.id }),
        isMissingInvoice,
      );
      await assert.rejects(caller.invoices.delete({ id: foreign.id + 100_000 }), isMissingInvoice);
      assert.ok(await prisma.invoice.findUnique({ where: { id: foreign.id } }));

      const racing = await createInvoice();
      let selected!: () => void;
      let resume!: () => void;
      const selectionComplete = new Promise<void>((resolve) => {
        selected = resolve;
      });
      const allowDelete = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const blockedClient = prisma.$extends({
        query: {
          invoice: {
            async findFirstOrThrow({ args, query }) {
              const result = await query(args);
              selected();
              await allowDelete;
              return result;
            },
          },
        },
      });
      const deleting = createCaller(blockedClient).invoices.delete({ id: racing.id });
      await selectionComplete;
      let payment;
      try {
        payment = await recordPayment(racing.id, 5_000);
      } finally {
        resume();
      }
      await assert.rejects(deleting, { code: "CONFLICT" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: racing.id } })).balanceCents, 5_000);
      assert.ok(await prisma.invoicePayment.findUnique({ where: { id: payment.id } }));
    } finally {
      await prisma.$disconnect();
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  },
);
