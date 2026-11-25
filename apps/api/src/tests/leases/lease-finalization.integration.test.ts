import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { planLeaseRentCharges } from "@parcelis/schemas";
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
      await prisma.invoiceCharge.create({
        data: { organizationId: organization.id, name: "Rent", description: "Monthly rent", isDefault: true },
      });
      const property = await prisma.property.create({
        data: {
          organizationId: organization.id,
          name: "Integration property",
          line1: "1 Test Street",
          city: "Test City",
          region: "IL",
          postalCode: "60000",
          unitCount: 3,
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
      const futureYear = new Date().getUTCFullYear() + 1;
      const futureStart = new Date(Date.UTC(futureYear, 0, 1));
      const futureEnd = new Date(Date.UTC(futureYear, 11, 31));
      const createDraft = async (unitName: string, startsOn = futureStart, endsOn = futureEnd) => {
        const unit = await prisma!.unit.create({
          data: { propertyId: property.id, name: unitName, marketRateCents: 120_000 },
        });
        const lease = await prisma!.lease.create({
          data: {
            organizationId: organization.id,
            propertyId: property.id,
            unitId: unit.id,
            startsOn,
            endsOn,
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
      const today = new Date();
      const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const currentEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, 0));
      const currentLease = await createDraft("C", currentStart, currentEnd);
      const current = await caller.leases.finalizeDraft({ leaseId: currentLease.id, expectedRevision: 4 });
      assert.equal(current.status, "active");
      assert.equal(current.invoiceSummary.invoiceCount, 12);
      assert.equal(await prisma.invoice.count({ where: { leaseId: currentLease.id } }), 12);

      const rollbackLease = await createDraft("B", currentStart, currentEnd);
      const charges = planLeaseRentCharges({
        monthlyRentCents: 120_000,
        rentDueDay: 1,
        startsOn: currentStart.toISOString().slice(0, 10),
        endsOn: currentEnd.toISOString().slice(0, 10),
        billingResponsibility: "joint",
        tenantIds: [tenant.id],
        tenantAllocations: [],
      });
      const conflictingCharge = charges[1]!;
      const conflictingPeriodStart = new Date(conflictingCharge.periodStartsOn);
      conflictingPeriodStart.setUTCDate(conflictingPeriodStart.getUTCDate() + 1);
      await prisma.invoice.create({
        data: {
          organizationId: organization.id,
          leaseId: rollbackLease.id,
          propertyId: property.id,
          tenantId: tenant.id,
          sourceKey: conflictingCharge.sourceKey,
          billingRevision: 1,
          periodStartsOn: conflictingPeriodStart,
          periodEndsOn: new Date(conflictingCharge.periodEndsOn),
          dueOn: new Date(conflictingCharge.dueOn),
          amountCents: conflictingCharge.amountCents,
          balanceCents: conflictingCharge.amountCents,
        },
      });
      await assert.rejects(caller.leases.finalizeDraft({ leaseId: rollbackLease.id, expectedRevision: 4 }), {
        code: "CONFLICT",
      });
      assert.equal(await prisma.invoice.count({ where: { leaseId: rollbackLease.id } }), 1);
      assert.equal(
        await prisma.invoice.count({ where: { leaseId: rollbackLease.id, sourceKey: charges[0]!.sourceKey } }),
        0,
      );
      assert.equal(await prisma.invoiceItem.count({ where: { invoice: { leaseId: rollbackLease.id } } }), 0);
      assert.equal(await prisma.invoiceRecipient.count({ where: { invoice: { leaseId: rollbackLease.id } } }), 0);
      assert.equal(
        await prisma.activityEvent.count({ where: { subjectType: "lease", subjectId: rollbackLease.id } }),
        0,
      );
      assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).occupiedUnits, 1);
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: rollbackLease.id } })).status, "draft");

      await prisma.rolePermission.createMany({
        data: [
          { role: "lease_manager", resource: "leases", canCreate: true, canEdit: true },
          { role: "lease_manager", resource: "properties", canView: true },
          { role: "lease_manager", resource: "units", canView: true },
          { role: "lease_manager", resource: "tenants", canView: true },
        ],
      });
      const restrictedCaller = appRouter.createCaller({
        prisma,
        session: { user: { id: 2, role: "lease_manager" } },
        organization: { organizationId: organization.id, organization },
      } as unknown as Context);
      await assert.rejects(restrictedCaller.leases.finalizeDraft({ leaseId: rollbackLease.id, expectedRevision: 4 }), {
        code: "FORBIDDEN",
      });
      assert.equal(await prisma.invoice.count({ where: { leaseId: rollbackLease.id } }), 1);
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
