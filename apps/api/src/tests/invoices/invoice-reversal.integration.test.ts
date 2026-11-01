import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.INVOICE_REVERSAL_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Invoice reversal integration tests require local PostgreSQL.");
}

test(
  "payment reversal preserves history and handles concurrent writes",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "invoice_reversal_test").catch(
      async (error) => {
        await admin.$disconnect();
        throw error;
      },
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
    });
    try {
      const organization = await prisma.organization.create({ data: { name: "Invoice test", slug: isolated.schema } });
      const other = await prisma.organization.create({ data: { name: "Other", slug: `${isolated.schema}-other` } });
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
      const createInvoice = () => {
        const dueOn = new Date(Date.UTC(2030, month++, 1));
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
            balanceCents: 10_000,
            recipients: { create: { tenantId: tenant.id } },
          },
        });
      };
      const createCaller = (client: unknown, organizationId = organization.id, role = "administrator") =>
        appRouter.createCaller({
          prisma: client,
          session: { user: { id: 42, name: "Test administrator", role } },
          organization: { organizationId },
        } as unknown as Context);
      const caller = createCaller(prisma);
      const pay = (id: number, amountCents: number) =>
        caller.invoices.recordPayment({
          id,
          amountCents,
          paidByTenantId: tenant.id,
          paidOn: new Date("2029-01-01"),
          paymentMethod: "check",
        });

      const full = await createInvoice();
      const fullPayment = await pay(full.id, 10_000);
      await assert.rejects(caller.invoices.reversePayment({ id: fullPayment.id, reason: "  " }), {
        code: "BAD_REQUEST",
      });
      await assert.rejects(
        createCaller(prisma, other.id).invoices.reversePayment({ id: fullPayment.id, reason: "Wrong account" }),
      );
      await assert.rejects(
        createCaller(prisma, organization.id, "property_manager").invoices.reversePayment({
          id: fullPayment.id,
          reason: "Wrong account",
        }),
        { code: "FORBIDDEN" },
      );
      assert.deepEqual(await caller.invoices.reversePayment({ id: fullPayment.id, reason: "  Entered twice  " }), {
        id: fullPayment.id,
      });
      const saved = await prisma.invoicePayment.findUniqueOrThrow({ where: { id: fullPayment.id } });
      assert.equal(saved.amountCents, 10_000);
      assert.ok(saved.reversedAt);
      assert.equal(saved.reversedById, "42");
      assert.equal(saved.reversedByName, "Test administrator");
      assert.equal(saved.reversalReason, "Entered twice");
      const notes = await caller.notes.list({ invoiceId: full.id, limit: 10 });
      assert.equal(notes.length, 1);
      assert.equal(notes[0]?.body, "Payment of $100.00 reversed by Test administrator.\nReason: Entered twice");
      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: full.id } });
      assert.equal(invoice.balanceCents, 10_000);
      assert.equal(invoice.status, "open");
      assert.equal(invoice.paidOn, null);
      assert.equal(invoice.paidByTenantId, null);
      assert.equal(invoice.paymentMethod, null);
      await caller.invoices.reversePayment({ id: fullPayment.id, reason: "A retry" });
      assert.equal((await caller.notes.list({ invoiceId: full.id, limit: 10 })).length, 1);
      assert.equal(
        (await prisma.invoicePayment.findUniqueOrThrow({ where: { id: fullPayment.id } })).reversalReason,
        "Entered twice",
      );
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: full.id } })).balanceCents, 10_000);
      assert.equal(
        await prisma.activityEvent.count({
          where: { subjectType: "invoice", subjectId: full.id, action: "invoice.payment_reversed" },
        }),
        1,
      );
      const event = await prisma.activityEvent.findFirstOrThrow({
        where: { subjectType: "invoice", subjectId: full.id, action: "invoice.payment_reversed" },
      });
      assert.equal(event.actorId, "42");
      assert.equal(event.actorLabel, "Test administrator");
      assert.deepEqual(event.metadata, { paymentId: fullPayment.id, amountCents: 10_000, reason: "Entered twice" });
      await assert.rejects(caller.invoices.delete({ id: full.id }), { code: "BAD_REQUEST" });

      await prisma.rolePermission.createMany({
        data: [
          { role: "property_manager", resource: "invoices", canView: true, canDelete: true },
          { role: "property_manager", resource: "invoice_notes", canView: true },
        ],
      });
      const restricted = createCaller(prisma, organization.id, "property_manager");
      assert.equal((await restricted.notes.list({ invoiceId: full.id, limit: 10 }))[0]?.body, notes[0]?.body);
      const staffInvoice = await createInvoice();
      const staffPayment = await pay(staffInvoice.id, 2_500);
      await restricted.invoices.reversePayment({ id: staffPayment.id, reason: "Staff correction" });
      assert.match(
        (await restricted.notes.list({ invoiceId: staffInvoice.id, limit: 10 }))[0]!.body,
        /Staff correction/,
      );

      const failedInvoice = await createInvoice();
      const failedPayment = await pay(failedInvoice.id, 2_500);
      const failingClient = prisma.$extends({
        query: {
          note: {
            async create() {
              throw new Error("Note storage failed");
            },
          },
        },
      });
      await assert.rejects(
        createCaller(failingClient).invoices.reversePayment({ id: failedPayment.id, reason: "Correction" }),
        /Note storage failed/,
      );
      assert.equal(
        (await prisma.invoicePayment.findUniqueOrThrow({ where: { id: failedPayment.id } })).reversedAt,
        null,
      );
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: failedInvoice.id } })).balanceCents, 7_500);
      assert.equal(await prisma.note.count({ where: { invoiceId: failedInvoice.id } }), 0);

      const partial = await createInvoice();
      const first = await pay(partial.id, 2_500);
      const second = await pay(partial.id, 2_500);
      await caller.invoices.reversePayment({ id: first.id, reason: "Wrong amount" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: partial.id } })).balanceCents, 7_500);
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: second.id } })).reversedAt, null);

      const voidInvoice = await createInvoice();
      const voidPayment = await pay(voidInvoice.id, 2_500);
      await prisma.invoice.update({ where: { id: voidInvoice.id }, data: { status: "void" } });
      await assert.rejects(caller.invoices.reversePayment({ id: voidPayment.id, reason: "Correction" }), {
        code: "CONFLICT",
      });
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: voidPayment.id } })).reversedAt, null);

      const simultaneous = await createInvoice();
      const duplicate = await pay(simultaneous.id, 2_500);
      const reversals = await Promise.allSettled([
        caller.invoices.reversePayment({ id: duplicate.id, reason: "Duplicate" }),
        caller.invoices.reversePayment({ id: duplicate.id, reason: "Duplicate" }),
      ]);
      assert.ok(reversals.some((result) => result.status === "fulfilled"));
      for (const result of reversals) {
        if (result.status === "rejected") assert.equal(result.reason.code, "CONFLICT");
      }
      await caller.invoices.reversePayment({ id: duplicate.id, reason: "Retry" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: simultaneous.id } })).balanceCents, 10_000);
      assert.equal(await prisma.note.count({ where: { invoiceId: simultaneous.id } }), 1);
      assert.equal(
        await prisma.activityEvent.count({
          where: { subjectType: "invoice", subjectId: simultaneous.id, action: "invoice.payment_reversed" },
        }),
        1,
      );

      const racing = await createInvoice();
      const original = await pay(racing.id, 2_500);
      let selected!: () => void;
      let resume!: () => void;
      const selectionComplete = new Promise<void>((resolve) => {
        selected = resolve;
      });
      const allowReversal = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const blockedClient = prisma.$extends({
        query: {
          invoicePayment: {
            async findFirstOrThrow({ args, query }) {
              const result = await query(args);
              selected();
              await allowReversal;
              return result;
            },
          },
        },
      });
      const reversing = createCaller(blockedClient).invoices.reversePayment({ id: original.id, reason: "Duplicate" });
      await selectionComplete;
      try {
        await pay(racing.id, 2_500);
      } finally {
        resume();
      }
      await assert.rejects(reversing, { code: "CONFLICT" });
      assert.equal((await prisma.invoicePayment.findUniqueOrThrow({ where: { id: original.id } })).reversedAt, null);
      await caller.invoices.reversePayment({ id: original.id, reason: "Duplicate" });
      assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: racing.id } })).balanceCents, 7_500);
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
