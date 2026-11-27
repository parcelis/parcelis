import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient, PrismaPg } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.TENANT_DELETE_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (process.env.TENANT_DELETE_INTEGRATION_TEST === "1" && !databaseUrl) {
  throw new Error("Tenant deletion integration tests require DATABASE_URL when enabled.");
}
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Tenant deletion integration tests require local PostgreSQL.");
}

test(
  "tenant deletion protects leases, billing, and concurrent payments",
  { skip: !databaseUrl, timeout: 60_000 },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "tenant_delete_test").catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
      transactionOptions: { timeout: 20_000 },
    });
    try {
      const organization = await prisma.organization.create({
        data: { name: "Tenant test", slug: "tenant-test" },
      });
      const organizationId = organization.id;
      const otherOrganization = await prisma.organization.create({ data: { name: "Other", slug: "other" } });
      const property = await prisma.property.create({
        data: {
          organizationId,
          name: "Test",
          line1: "1 Test Street",
          city: "Test",
          region: "IL",
          postalCode: "60000",
          unitCount: 1,
        },
      });
      const createCaller = (
        client: unknown,
        scope = organization,
        role: NonNullable<Context["session"]>["user"]["role"] = "administrator",
      ) =>
        appRouter.createCaller({
          prisma: client,
          req: { headers: {} },
          transport: "trpc",
          principal: { kind: "user", userId: 1 },
          session: {
            userId: 1,
            user: {
              id: 1,
              name: "Test User",
              email: "test@example.test",
              phone: null,
              profileImageObjectKey: null,
              role,
              accountStatus: "active",
              defaultOrganizationId: scope.id,
            },
          },
          organization: { organizationId: scope.id, role: "administrator", organization: scope },
        } as unknown as Context);
      const caller = createCaller(prisma);
      let tenantNumber = 0;
      const createTenant = () =>
        prisma.tenant.create({
          data: {
            organizationId,
            firstName: "Test",
            lastName: "Tenant",
            email: `tenant${tenantNumber++}@example.test`,
          },
        });
      const createLease = (
        tenantIds: number[],
        status: Prisma.LeaseCreateInput["status"] = "draft",
        billingResponsibility: Prisma.LeaseCreateInput["billingResponsibility"] = "joint",
      ) =>
        prisma.lease.create({
          data: {
            organizationId,
            propertyId: property.id,
            status,
            billingResponsibility,
            tenants: {
              create: tenantIds.map((tenantId) => ({
                organizationId,
                tenantId,
                rentShareCents: 5_000,
                depositShareCents: 1_000,
              })),
            },
          },
        });
      const dueOn = new Date("2027-01-01");
      const createInvoice = (leaseId: number, tenantId: number, recipientIds: number[]) =>
        prisma.invoice.create({
          data: {
            organizationId,
            leaseId,
            propertyId: property.id,
            tenantId,
            dueOn,
            periodStartsOn: dueOn,
            periodEndsOn: dueOn,
            amountCents: 10_000,
            balanceCents: 10_000,
            recipients: { create: recipientIds.map((id) => ({ tenantId: id })) },
          },
          include: { recipients: true },
        });
      const protectedTenant = { code: "CONFLICT", message: /Archive the tenant instead/ };

      const unused = await createTenant();
      await assert.rejects(
        createCaller(prisma, otherOrganization).tenants.delete({ id: unused.id }),
        (error: unknown) =>
          error instanceof TRPCError &&
          error.cause instanceof Prisma.PrismaClientKnownRequestError &&
          error.cause.code === "P2025",
      );
      await assert.rejects(createCaller(prisma, organization, "property_manager").tenants.delete({ id: unused.id }), {
        code: "FORBIDDEN",
      });
      await caller.tenants.delete({ id: unused.id });
      assert.equal(await prisma.tenant.findUnique({ where: { id: unused.id } }), null);

      const draftTenant = await createTenant();
      const otherTenant = await createTenant();
      const sharedDraft = await createLease([draftTenant.id, otherTenant.id], "draft", "individual");
      await prisma.lease.update({ where: { id: sharedDraft.id }, data: { revision: 7 } });
      const soleDraft = await createLease([draftTenant.id]);
      const draftAssignments = await prisma.leaseTenant.findMany({ where: { tenantId: otherTenant.id } });
      await caller.tenants.delete({ id: draftTenant.id });
      assert.deepEqual(await prisma.leaseTenant.findMany({ where: { leaseId: sharedDraft.id } }), draftAssignments);
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: sharedDraft.id } })).revision, 8);
      await assert.rejects(caller.leases.finalizeDraft({ leaseId: sharedDraft.id, expectedRevision: 7 }), {
        code: "CONFLICT",
        message: "Lease draft has changed. Reload and try again.",
      });
      assert.ok(await prisma.lease.findUnique({ where: { id: soleDraft.id } }));
      assert.deepEqual(await caller.leases.delete({ id: soleDraft.id }), { id: soleDraft.id });

      for (const status of ["scheduled", "active", "notice", "ended"] as const) {
        const tenant = await createTenant();
        const lease = await createLease([tenant.id], status);
        await assert.rejects(caller.tenants.delete({ id: tenant.id }), protectedTenant);
        await assert.rejects(caller.leases.delete({ id: lease.id }), { code: "CONFLICT" });
      }

      for (const billing of ["single", "joint", "individual"] as const) {
        const tenant = await createTenant();
        const primaryId = billing === "single" ? tenant.id : otherTenant.id;
        const tenantIds = billing === "single" ? [primaryId] : [primaryId, tenant.id];
        const lease = await createLease(tenantIds, "active", billing === "individual" ? "individual" : "joint");
        const assignments = await prisma.leaseTenant.findMany({
          where: { leaseId: lease.id },
          orderBy: { tenantId: "asc" },
        });
        const invoice = await createInvoice(lease.id, primaryId, billing === "joint" ? tenantIds : [primaryId]);
        const invoices =
          billing === "individual" ? [invoice, await createInvoice(lease.id, tenant.id, [tenant.id])] : [invoice];
        await assert.rejects(caller.tenants.delete({ id: tenant.id }), protectedTenant);
        assert.deepEqual(
          await prisma.leaseTenant.findMany({ where: { leaseId: lease.id }, orderBy: { tenantId: "asc" } }),
          assignments,
        );
        for (const saved of invoices) {
          assert.deepEqual(
            await prisma.invoice.findUnique({ where: { id: saved.id }, include: { recipients: true } }),
            saved,
          );
        }
        assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).status, "active");
        assert.ok((await caller.tenants.archive({ id: tenant.id })).archivedAt);
        await assert.rejects(caller.tenants.delete({ id: tenant.id }), protectedTenant);
      }

      const primary = await createTenant();
      const recipient = await createTenant();
      const legacyPayer = await createTenant();
      const billedDraft = await createLease([primary.id]);
      const invoice = await createInvoice(billedDraft.id, primary.id, [primary.id, recipient.id]);
      await prisma.invoice.update({ where: { id: invoice.id }, data: { paidByTenantId: legacyPayer.id } });
      await assert.rejects(caller.tenants.delete({ id: primary.id }), protectedTenant);
      await assert.rejects(caller.tenants.delete({ id: recipient.id }), protectedTenant);
      await assert.rejects(caller.tenants.delete({ id: legacyPayer.id }), protectedTenant);
      await assert.rejects(caller.leases.delete({ id: billedDraft.id }), { code: "CONFLICT" });

      const racingTenant = await createTenant();
      let selected!: () => void;
      let resume!: () => void;
      const selectionComplete = new Promise<void>((resolve) => {
        selected = resolve;
      });
      const allowDelete = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const delayedClient = prisma.$extends({
        query: {
          tenant: {
            async findFirstOrThrow({ args, query }) {
              const result = await query(args);
              selected();
              await allowDelete;
              return result;
            },
          },
        },
      });
      const deletion = createCaller(delayedClient).tenants.delete({ id: racingTenant.id });
      const rejected = assert.rejects(deletion, { code: "CONFLICT", message: /changed while deleting/ });
      try {
        await Promise.race([
          selectionComplete,
          rejected.then(() => assert.fail("Deletion finished before the payment")),
        ]);
        await prisma.invoiceRecipient.create({
          data: { organizationId, invoiceId: invoice.id, tenantId: racingTenant.id },
        });
        const payment = await caller.invoices.recordPayment({
          id: invoice.id,
          paidByTenantId: racingTenant.id,
          amountCents: 5_000,
          paidOn: dueOn,
          paymentMethod: "check",
        });
        assert.ok(await prisma.invoicePayment.findUnique({ where: { id: payment.id } }));
      } finally {
        resume();
        await rejected;
      }
      const afterPayment = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { recipients: true },
      });
      assert.equal(afterPayment.balanceCents, 5_000);
      assert.ok(afterPayment.recipients.some(({ tenantId }) => tenantId === racingTenant.id));
      assert.ok(await prisma.tenant.findUnique({ where: { id: racingTenant.id } }));
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
