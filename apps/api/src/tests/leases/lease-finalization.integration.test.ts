import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { planLeaseRentCharges } from "@parcelis/schemas";
import { createLeaseRentInvoices } from "../../leases/lease-rent-invoices";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.LEASE_BILLING_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;

if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Lease billing integration tests require local PostgreSQL.");
  }
}

test(
  "PostgreSQL finalization is atomic and concurrent requests create one schedule",
  { skip: !databaseUrl },
  async () => {
    const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "lease_billing_test").catch(async (error) => {
      await admin.$disconnect();
      throw error;
    });
    let prisma: PrismaClient | undefined;

    try {
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
      });
      const testId = randomUUID();
      const organization = await prisma.organization.create({
        data: { name: "Lease billing integration", slug: `lease-billing-${testId}`, timeZone: "UTC" },
      });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: "Integration property",
          line1: "1 Test Street",
          city: "Test City",
          region: "IL",
          postalCode: "60000",
          unitCount: 2,
        },
      });
      const tenant = await prisma.tenant.create({
        data: {
          organizationId: organization.id,
          firstName: "Test",
          lastName: "Resident",
          email: `lease-billing-${testId}@example.test`,
        },
      });
      const createDraft = async (unitName: string) => {
        const unit = await prisma!.unit.create({
          data: { propertyId: property.id, name: unitName, marketRateCents: 120_000 },
        });
        const lease = await prisma!.lease.create({
          data: {
            organizationId: organization.id,
            propertyId: property.id,
            unitId: unit.id,
            startsOn: new Date("2027-01-01T00:00:00.000Z"),
            endsOn: new Date("2027-12-31T00:00:00.000Z"),
            monthlyRentCents: 120_000,
            rentDueDay: 1,
            termType: "fixed",
            billingResponsibility: "joint",
            revision: 4,
          },
        });
        await prisma!.leaseTenant.create({
          data: { organizationId: organization.id, leaseId: lease.id, tenantId: tenant.id },
        });
        return lease;
      };

      const lease = await createDraft("A");
      const caller = appRouter.createCaller({
        prisma,
        session: { user: { id: 1, role: "administrator" } },
        organization: { organizationId: organization.id, organization },
      } as unknown as Context);
      const input = { leaseId: lease.id, expectedRevision: 4 };
      const [first, second] = await Promise.all([
        caller.leases.finalizeDraft(input),
        caller.leases.finalizeDraft(input),
      ]);

      assert.deepEqual(first.invoiceSummary, { invoiceCount: 12, rentTotalCents: 1_440_000 });
      assert.deepEqual(second.invoiceSummary, first.invoiceSummary);
      assert.equal(await prisma.invoice.count({ where: { leaseId: lease.id } }), 12);
      assert.equal(await prisma.activityEvent.count({ where: { subjectType: "lease", subjectId: lease.id } }), 1);

      const rollbackLease = await createDraft("B");
      const charges = planLeaseRentCharges({
        monthlyRentCents: 120_000,
        rentDueDay: 1,
        startsOn: "2027-01-01",
        endsOn: "2027-12-31",
        billingResponsibility: "joint",
        tenantIds: [tenant.id],
        tenantAllocations: [],
      });
      await assert.rejects(
        prisma.$transaction((tx) =>
          createLeaseRentInvoices(tx, {
            organizationId: organization.id,
            leaseId: rollbackLease.id,
            propertyId: property.id,
            billingRevision: 1,
            today: "2026-10-05",
            charges: [charges[0]!, charges[0]!],
          }),
        ),
        { code: "P2002" },
      );
      assert.equal(await prisma.invoice.count({ where: { leaseId: rollbackLease.id } }), 0);
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: rollbackLease.id } })).status, "draft");
    } finally {
      try {
        await prisma?.$disconnect();
      } finally {
        try {
          await isolated.cleanup();
        } finally {
          await admin.$disconnect();
        }
      }
    }
  },
);
