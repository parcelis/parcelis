import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { planLeaseRentCharges } from "@parcelis/schemas";
import {
  applyLeaseAmendment,
  leaseRosterWhere,
  markRentInvoiceIssued,
  planLeaseAmendment,
} from "../../leases/lease-amendments";
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
  "PostgreSQL finalization and amendments are atomic across concurrent billing operations",
  { skip: !databaseUrl },
  async (t) => {
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
        data: {
          name: "Lease billing integration",
          slug: `lease-billing-${testId}`,
          timeZone: "UTC",
          currencyCode: "EUR",
        },
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
      const nextResident = await prisma.tenant.create({
        data: {
          organizationId: organization.id,
          firstName: "New",
          lastName: "Resident",
          email: `new-${testId}@example.test`,
        },
      });
      const effectiveOn = `${futureYear}-02-01`;
      const amendment = {
        leaseId: lease.id,
        expectedRevision: 5,
        effectiveOn,
        endsOn: `${futureYear}-12-31`,
        monthlyRentCents: 140_000,
        rentDueDay: 5,
        billingResponsibility: "individual" as const,
        tenantIds: [nextResident.id],
        tenantAllocations: [{ tenantId: nextResident.id, rentShareCents: 140_000, depositShareCents: 0 }],
        reason: "Change rent and resident from February",
      };
      await assert.rejects(caller.leases.previewAmendment({ ...amendment, expectedRevision: 4 }), { code: "CONFLICT" });
      await assert.rejects(caller.leases.previewAmendment({ ...amendment, effectiveOn: `${futureYear}-02-15` }), {
        code: "BAD_REQUEST",
      });
      await assert.rejects(caller.leases.previewAmendment({ ...amendment, tenantAllocations: [] }), {
        code: "BAD_REQUEST",
      });
      const foreign = appRouter.createCaller({
        prisma,
        session: { user: { id: 1, role: "administrator" } },
        organization: { organizationId: organization.id + 1, organization },
      } as unknown as Context);
      await assert.rejects(foreign.leases.previewAmendment(amendment), { code: "NOT_FOUND" });
      await prisma.tenant.update({ where: { id: nextResident.id }, data: { archivedAt: new Date() } });
      await assert.rejects(caller.leases.previewAmendment(amendment), /unarchived residents/);
      await prisma.tenant.update({ where: { id: nextResident.id }, data: { archivedAt: null } });

      await prisma.lease.create({
        data: {
          organizationId: organization.id,
          propertyId: property.id,
          unitId: lease.unitId,
          startsOn: new Date(Date.UTC(futureYear + 1, 0, 1)),
          status: "scheduled",
        },
      });
      await assert.rejects(
        caller.leases.previewAmendment({ ...amendment, endsOn: `${futureYear + 1}-01-31` }),
        /overlaps another lease/,
      );
      const historical = await prisma.invoice.findFirstOrThrow({
        where: { leaseId: lease.id, periodStartsOn: futureStart },
        include: { recipients: true },
      });
      const february = await prisma.invoice.findFirstOrThrow({
        where: { leaseId: lease.id, periodStartsOn: new Date(effectiveOn) },
      });
      await markRentInvoiceIssued(prisma, february);
      assert.ok((await prisma.invoice.findUniqueOrThrow({ where: { id: february.id } })).issuedAt);
      await assert.rejects(caller.leases.previewAmendment(amendment), /invoice #.* is protected/i);
      await prisma.invoice.update({ where: { id: february.id }, data: { issuedAt: null } });
      const preview = await caller.leases.previewAmendment(amendment);
      assert.equal(preview.changes.length, 22);
      assert.equal(await prisma.invoice.count({ where: { leaseId: lease.id } }), 12);
      await assert.rejects(caller.leases.applyAmendment({ ...amendment, previewToken: "a".repeat(64) }), {
        code: "CONFLICT",
      });
      const committed = { ...amendment, previewToken: preview.previewToken };
      assert.deepEqual(await caller.leases.applyAmendment(committed), { revision: 6 });
      assert.deepEqual(await caller.leases.applyAmendment(committed), { revision: 6 });
      assert.equal(
        await prisma.activityEvent.count({
          where: { subjectType: "lease", subjectId: lease.id, action: "lease.amended" },
        }),
        1,
      );
      assert.deepEqual(
        await prisma.invoice.findUniqueOrThrow({ where: { id: historical.id }, include: { recipients: true } }),
        historical,
      );
      const amended = await prisma.invoice.findFirstOrThrow({
        where: { leaseId: lease.id, periodStartsOn: new Date(effectiveOn) },
        include: { recipients: true },
      });
      assert.equal(amended.amountCents, 140_000);
      assert.equal(amended.currencyCode, "EUR");
      assert.equal(amended.billingRevision, 6);
      assert.equal(amended.dueOn.toISOString().slice(0, 10), `${futureYear}-02-05`);
      assert.deepEqual(
        amended.recipients.map(({ tenantId }) => tenantId),
        [nextResident.id],
      );
      assert.deepEqual(
        (await caller.leases.byId({ id: lease.id }))?.tenants.map(({ id }) => id),
        [tenant.id],
      );
      const memberships = await prisma.leaseTenant.findMany({ where: { leaseId: lease.id } });
      const effectiveRoster = await prisma.leaseTenant.findMany({
        where: { leaseId: lease.id, ...leaseRosterWhere(effectiveOn) },
      });
      assert.deepEqual(
        effectiveRoster.map(({ tenantId }) => tenantId),
        [nextResident.id],
      );
      assert.equal(
        memberships
          .find(({ tenantId }) => tenantId === tenant.id)
          ?.removedOn?.toISOString()
          .slice(0, 10),
        effectiveOn,
      );
      assert.equal(
        memberships
          .find(({ tenantId }) => tenantId === nextResident.id)
          ?.assignedOn?.toISOString()
          .slice(0, 10),
        effectiveOn,
      );
      const events = await caller.leases.lifecycleEvents({ id: lease.id });
      const event = events.find(({ action }) => action === "lease.amended");
      assert.ok(event?.metadata && typeof event.metadata === "object" && "reason" in event.metadata);
      assert.equal(event.metadata.reason, amendment.reason);

      const termsLease = await createDraft("Pending terms");
      await prisma.lease.update({
        where: { id: termsLease.id },
        data: { billingResponsibility: "individual", currencyCode: "CAD" },
      });
      await prisma.leaseTenant.updateMany({
        where: { leaseId: termsLease.id },
        data: { rentShareCents: 120_000, depositShareCents: 0 },
      });
      await caller.leases.finalizeDraft({ leaseId: termsLease.id, expectedRevision: 4 });
      await prisma.rolePermission.createMany({
        data: [
          { role: "property_manager", resource: "leases", canView: true, canEdit: true },
          { role: "property_manager", resource: "invoices", canView: true, canEdit: true },
        ],
      });
      const termsOnly = appRouter.createCaller({
        prisma,
        session: { user: { id: 1, role: "property_manager" } },
        organization: { organizationId: organization.id, organization },
      } as unknown as Context);
      const allocation = { tenantId: tenant.id, rentShareCents: 120_000, depositShareCents: 0 };
      const termsEdit = {
        ...amendment,
        leaseId: termsLease.id,
        tenantIds: [tenant.id],
        monthlyRentCents: 120_000,
        tenantAllocations: [allocation],
      };
      await termsOnly.leases.previewAmendment(termsEdit);
      const shortened = { ...termsEdit, endsOn: `${futureYear}-11-30` };
      const shortenedPreview = await termsOnly.leases.previewAmendment(shortened);
      await assert.rejects(
        termsOnly.leases.applyAmendment({ ...shortened, previewToken: shortenedPreview.previewToken }),
        /cannot delete invoices/,
      );
      const changedResponsibility = { ...termsEdit, billingResponsibility: "joint" as const, tenantAllocations: [] };
      await assert.rejects(termsOnly.leases.previewAmendment(changedResponsibility), { code: "FORBIDDEN" });
      const revised = {
        ...termsEdit,
        endsOn: `${futureYear}-11-30`,
        monthlyRentCents: 140_000,
        tenantAllocations: [{ ...allocation, rentShareCents: 140_000 }],
      };
      await assert.rejects(termsOnly.leases.previewAmendment(revised), { code: "FORBIDDEN" });
      const revisedPreview = await caller.leases.previewAmendment(revised);
      const applyRevised = { ...revised, previewToken: revisedPreview.previewToken };
      await assert.rejects(termsOnly.leases.applyAmendment(applyRevised), { code: "FORBIDDEN" });
      await caller.leases.applyAmendment(applyRevised);
      const currentTerms = await caller.leases.byId({ id: termsLease.id });
      assert.equal(currentTerms?.hasPendingAmendment, true);
      assert.equal(currentTerms?.currencyCode, "CAD");
      assert.equal(currentTerms?.monthlyRentCents, 120_000);
      assert.equal(currentTerms?.rentDueDay, 1);
      assert.deepEqual(currentTerms?.endsOn, futureEnd);
      assert.deepEqual(currentTerms?.tenantAllocations, [allocation]);
      assert.equal((await prisma.invoice.findFirstOrThrow({ where: { leaseId: termsLease.id } })).currencyCode, "CAD");
      for (const result of [
        (await caller.properties.list()).find(({ id }) => id === property.id),
        await caller.properties.byId({ id: property.id }),
      ]) {
        const projected = result?.leases.find(({ id }) => id === termsLease.id);
        assert.equal(projected?.monthlyRentCents, 120_000);
        assert.deepEqual(projected?.endsOn, futureEnd);
      }
      await prisma.rolePermission.create({ data: { role: "resident_manager", resource: "leases", canView: true } });
      const leaseReader = appRouter.createCaller({
        prisma,
        session: { user: { id: 1, role: "resident_manager" } },
        organization: { organizationId: organization.id, organization },
      } as unknown as Context);
      for (const result of [
        await leaseReader.leases.lifecycleEvents({ id: lease.id }),
        await leaseReader.activityEvents.list({ subjectType: "lease", subjectId: lease.id }),
      ]) {
        const metadata = result.find(({ action }) => action === "lease.amended")?.metadata;
        assert.ok(metadata && typeof metadata === "object" && "reason" in metadata);
        assert.equal("invoices" in metadata, false);
      }

      t.mock.timers.enable({ apis: ["Date"], now: new Date(`${effectiveOn}T12:00:00Z`).getTime() });
      try {
        await assert.rejects(caller.tenants.delete({ id: nextResident.id }), /last current resident/);
        const returning = {
          ...amendment,
          expectedRevision: 6,
          effectiveOn: `${futureYear}-03-01`,
          tenantIds: [tenant.id],
          tenantAllocations: [{ tenantId: tenant.id, rentShareCents: 140_000, depositShareCents: 0 }],
        };
        const returningPreview = await caller.leases.previewAmendment(returning);
        await caller.leases.applyAmendment({ ...returning, previewToken: returningPreview.previewToken });
        for (const [date, tenantId] of [
          [`${futureYear}-01-15`, tenant.id],
          [effectiveOn, nextResident.id],
          [returning.effectiveOn, tenant.id],
        ] as const) {
          const rows: { tenantId: number }[] = await prisma.leaseTenant.findMany({
            where: { leaseId: lease.id, ...leaseRosterWhere(date) },
            select: { tenantId: true },
          });
          assert.deepEqual(
            rows.map((row) => row.tenantId),
            [tenantId],
          );
        }
        assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: historical.id } })).tenantId, tenant.id);
      } finally {
        t.mock.timers.reset();
      }

      const rollingLease = await createDraft("Rolling lease", new Date(Date.UTC(futureYear - 2, 0, 1)));
      await prisma.lease.update({
        where: { id: rollingLease.id },
        data: { termType: "month_to_month", endsOn: null },
      });
      await caller.leases.finalizeDraft({ leaseId: rollingLease.id, expectedRevision: 4 });
      const rollingEdit = {
        ...termsEdit,
        leaseId: rollingLease.id,
        monthlyRentCents: 125_000,
        endsOn: null,
        billingResponsibility: "joint" as const,
        tenantAllocations: [],
      };
      const rollingPreview = await termsOnly.leases.previewAmendment(rollingEdit);
      assert.equal(rollingPreview.changes.length, 12);
      assert.equal(rollingPreview.changes[0]?.periodStartsOn, effectiveOn);
      await prisma.$transaction(async (tx) => {
        const plan = await planLeaseAmendment(
          tx,
          organization.id,
          "administrator",
          new Date().toISOString().slice(0, 10),
          {
            ...rollingEdit,
            rentDueDay: 1,
          },
        );
        await assert.rejects(applyLeaseAmendment(tx, organization.id, effectiveOn, plan), /billing date changed/);
      });
      await assert.rejects(
        termsOnly.leases.applyAmendment({ ...rollingEdit, previewToken: rollingPreview.previewToken }),
        /cannot create invoices/,
      );
      await caller.leases.applyAmendment({ ...rollingEdit, previewToken: rollingPreview.previewToken });
      assert.equal(await prisma.invoice.count({ where: { leaseId: rollingLease.id } }), 24);
      assert.equal((await caller.properties.list()).find(({ id }) => id === property.id)?.monthlyRentCents, 120_000);
      t.mock.timers.enable({ apis: ["Date"], now: new Date(`${effectiveOn}T12:00:00Z`).getTime() });
      try {
        assert.equal((await caller.properties.list()).find(({ id }) => id === property.id)?.monthlyRentCents, 125_000);
      } finally {
        t.mock.timers.reset();
      }

      const raceLease = await createDraft("Payment race");
      await caller.leases.finalizeDraft({ leaseId: raceLease.id, expectedRevision: 4 });
      const raceInput = { ...amendment, leaseId: raceLease.id };
      const racePreview = await caller.leases.previewAmendment(raceInput);
      const raceInvoice = await prisma.invoice.findFirstOrThrow({
        where: { leaseId: raceLease.id, periodStartsOn: new Date(effectiveOn) },
      });
      const [applied, payment] = await Promise.allSettled([
        caller.leases.applyAmendment({ ...raceInput, previewToken: racePreview.previewToken }),
        caller.invoices.recordPayment({
          id: raceInvoice.id,
          amountCents: 10_000,
          paidOn: futureStart,
          paidByTenantId: tenant.id,
          paymentMethod: "check",
        }),
      ]);
      assert.notEqual(applied.status, payment.status);
      if (payment.status === "fulfilled") {
        const paid = await prisma.invoice.findUniqueOrThrow({
          where: { id: raceInvoice.id },
          include: { payments: true, recipients: true },
        });
        assert.equal(paid.balanceCents, 110_000);
        assert.equal(paid.payments[0]?.amountCents, 10_000);
        assert.deepEqual(
          paid.recipients.map(({ tenantId }) => tenantId),
          [tenant.id],
        );
        await assert.rejects(caller.leases.previewAmendment(raceInput), /invoice #.* is protected/i);
      } else {
        assert.equal(await prisma.invoicePayment.count({ where: { invoiceId: raceInvoice.id } }), 0);
        assert.equal(
          await prisma.invoice.count({
            where: { leaseId: raceLease.id, periodStartsOn: new Date(effectiveOn), tenantId: nextResident.id },
          }),
          1,
        );
      }

      const today = new Date();
      const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const currentEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, 0));
      const currentLease = await createDraft("C", currentStart, currentEnd);
      const current = await caller.leases.finalizeDraft({ leaseId: currentLease.id, expectedRevision: 4 });
      assert.equal(current.status, "active");
      assert.equal(current.invoiceSummary.invoiceCount, 12);
      assert.equal(await prisma.invoice.count({ where: { leaseId: currentLease.id } }), 12);

      const occupiedBeforeRollback = (await prisma.property.findUniqueOrThrow({ where: { id: property.id } }))
        .occupiedUnits;
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
      assert.equal(
        (await prisma.property.findUniqueOrThrow({ where: { id: property.id } })).occupiedUnits,
        occupiedBeforeRollback,
      );
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: rollbackLease.id } })).status, "draft");

      const proratedStart = new Date(Date.UTC(futureYear, 0, 31));
      const proratedLease = await createDraft("Prorated rent", proratedStart);
      await prisma.lease.update({ where: { id: proratedLease.id }, data: { billingResponsibility: "individual" } });
      await prisma.leaseTenant.updateMany({
        where: { leaseId: proratedLease.id, tenantId: tenant.id },
        data: { rentShareCents: 1, depositShareCents: 0 },
      });
      await prisma.leaseTenant.create({
        data: {
          organizationId: organization.id,
          leaseId: proratedLease.id,
          tenantId: nextResident.id,
          rentShareCents: 119_999,
          depositShareCents: 0,
        },
      });
      await caller.leases.finalizeDraft({ leaseId: proratedLease.id, expectedRevision: 4 });
      const zeroInvoice = await prisma.invoice.findFirstOrThrow({
        where: { leaseId: proratedLease.id, tenantId: tenant.id, periodStartsOn: proratedStart },
      });
      assert.equal(zeroInvoice.status, "paid");
      assert.equal(zeroInvoice.amountCents, 0);
      const revisedAllocation = {
        ...amendment,
        leaseId: proratedLease.id,
        effectiveOn: `${futureYear}-01-31`,
        monthlyRentCents: 120_000,
        rentDueDay: 1,
        tenantIds: [tenant.id, nextResident.id],
        tenantAllocations: [
          { tenantId: tenant.id, rentShareCents: 31, depositShareCents: 0 },
          { tenantId: nextResident.id, rentShareCents: 119_969, depositShareCents: 0 },
        ],
        reason: "Revise the prorated rent allocation",
      };
      const zeroPreview = await caller.leases.previewAmendment(revisedAllocation);
      await caller.leases.applyAmendment({ ...revisedAllocation, previewToken: zeroPreview.previewToken });
      const revisedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: zeroInvoice.id } });
      assert.equal(revisedInvoice.status, "open");
      assert.equal(revisedInvoice.amountCents, 1);
      assert.equal(revisedInvoice.balanceCents, 1);

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
      await assert.rejects(restrictedCaller.leases.previewAmendment(amendment), { code: "FORBIDDEN" });
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
