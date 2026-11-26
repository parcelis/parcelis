import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { createIsolatedTestSchema } from "../../../../../scripts/outbox-test-database.mjs";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

const databaseUrl = process.env.LEASE_BILLING_INTEGRATION_TEST === "1" ? process.env.DATABASE_URL : undefined;
if (databaseUrl && !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Lease archive integration tests require local PostgreSQL.");
}

function pauseWrite(prisma: PrismaClient, modelName: string, operationName: string) {
  let markPaused!: () => void;
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    markPaused = resolve;
  });
  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  const client = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!intercepted && model === modelName && operation === operationName) {
            intercepted = true;
            markPaused();
            await resumed;
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
  return { client, paused, release };
}

async function compete(
  barrier: ReturnType<typeof pauseWrite>,
  first: Promise<unknown>,
  second: () => Promise<unknown>,
) {
  const result = Promise.allSettled([first]);
  try {
    await Promise.race([barrier.paused, first.then(() => assert.fail("Write did not reach the barrier"))]);
    await second();
  } finally {
    barrier.release();
    await result;
  }
  return (await result)[0]!;
}

test("PostgreSQL lease archive eligibility and unit history are transactional", { skip: !databaseUrl }, async (t) => {
  const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  const isolated = await createIsolatedTestSchema(admin, databaseUrl!, "lease_archive_test").catch(async (error) => {
    await admin.$disconnect();
    throw error;
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }, { schema: isolated.schema }),
  });
  t.after(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      try {
        await isolated.cleanup();
      } finally {
        await admin.$disconnect();
      }
    }
  });
  const organization = await prisma.organization.create({
    data: { name: "Unit history", slug: randomUUID(), timeZone: "UTC" },
  });
  const organizationId = organization.id;
  const category = await prisma.maintenanceCategory.create({ data: { organizationId, label: "Repairs" } });
  const landlord = await prisma.landlord.create({
    data: { organizationId, firstName: "Test", lastName: "Landlord", email: "landlord@example.test" },
  });
  await prisma.invoiceCharge.create({ data: { organizationId, name: "Rent", isDefault: true } });

  const callerFor = (client = prisma) =>
    appRouter.createCaller({
      prisma: client,
      session: { userId: 1, user: { id: 1, role: "administrator" } },
      organization: { organizationId, organization },
    } as unknown as Context);
  const caller = callerFor();

  async function fixture() {
    const property = await prisma.property.create({
      data: {
        organizationId,
        name: randomUUID(),
        line1: "1 Test Street",
        city: "Chicago",
        region: "IL",
        postalCode: "60601",
        unitCount: 2,
      },
    });
    const propertyId = property.id;
    const [unit, otherUnit, tenant] = await Promise.all([
      prisma.unit.create({ data: { propertyId, name: "A", marketRateCents: 120_000 } }),
      prisma.unit.create({ data: { propertyId, name: "B", marketRateCents: 120_000 } }),
      prisma.tenant.create({
        data: { organizationId, firstName: "Test", lastName: "Resident", email: `${randomUUID()}@example.test` },
      }),
    ]);
    const unitId = unit.id;
    const ticketInput = {
      propertyId,
      unitIds: [unitId],
      ticketTitle: "Repair request",
      categoryId: category.id,
      requestedById: landlord.id,
      requestedByType: "landlord" as const,
    };
    const futureYear = new Date().getUTCFullYear() + 1;
    const createDraft = () =>
      prisma.lease.create({
        data: {
          organizationId,
          propertyId,
          unitId,
          termType: "fixed",
          startsOn: new Date(Date.UTC(futureYear, 0, 1)),
          endsOn: new Date(Date.UTC(futureYear, 1, 28)),
          monthlyRentCents: 120_000,
          billingResponsibility: "joint",
          tenants: { create: { tenantId: tenant.id } },
        },
      });
    return { propertyId, unitId, otherUnitId: otherUnit.id, tenantId: tenant.id, ticketInput, createDraft };
  }

  await t.test("archived selections block new assignments and existing drafts can be reassigned", async () => {
    const { propertyId, unitId, otherUnitId, tenantId, createDraft } = await fixture();
    const draft = await createDraft();
    await caller.units.archive({ id: unitId });
    await assert.rejects(caller.leases.createDraft({ leaseDraftKey: randomUUID(), propertyId, unitId }), {
      code: "CONFLICT",
      message: /unit.*archived/,
    });
    const directInput = {
      propertyId,
      unitId,
      tenantIds: [tenantId],
      termType: "fixed" as const,
      status: "draft" as const,
      startsOn: "2026-01-01",
      endsOn: "2026-02-28",
      monthlyRentCents: 120_000,
      billingResponsibility: "joint" as const,
    };
    for (const createLease of [caller.leases.create, caller.tenants.createLease]) {
      await assert.rejects(createLease(directInput), { code: "CONFLICT", message: /unit.*archived/ });
      const eligible = await fixture();
      const saved = await createLease({
        ...directInput,
        propertyId: eligible.propertyId,
        unitId: eligible.unitId,
        tenantIds: [eligible.tenantId],
      });
      assert.equal(saved.tenants[0]?.tenantId, eligible.tenantId);
    }
    const finalize = (expectedRevision: number) => caller.leases.finalizeDraft({ leaseId: draft.id, expectedRevision });
    await assert.rejects(finalize(0), { code: "CONFLICT", message: /unit.*archived/ });
    assert.equal((await caller.leases.draftByKey({ leaseDraftKey: draft.leaseDraftKey }))?.unitId, unitId);
    const reassigned = await caller.leases.updateDraft({
      leaseId: draft.id,
      expectedRevision: 0,
      data: { unitId: otherUnitId },
    });
    await assert.rejects(
      caller.leases.updateDraft({ leaseId: draft.id, expectedRevision: reassigned.revision, data: { unitId } }),
      { code: "CONFLICT", message: /unit.*archived/ },
    );
    await caller.properties.archive({ id: propertyId });
    await assert.rejects(caller.leases.createDraft({ leaseDraftKey: randomUUID(), propertyId, unitId: otherUnitId }), {
      code: "CONFLICT",
      message: /property.*archived/,
    });
    await assert.rejects(finalize(reassigned.revision), { code: "CONFLICT", message: /property.*archived/ });
    await caller.properties.reactivate({ id: propertyId });
    await caller.tenants.archive({ id: tenantId });
    const eligible = await fixture();
    await caller.tenants.archive({ id: eligible.tenantId });
    await assert.rejects(
      caller.leases.updateDraft({
        leaseId: draft.id,
        expectedRevision: reassigned.revision,
        data: { tenantIds: [eligible.tenantId] },
      }),
      { code: "CONFLICT", message: /residents.*archived/ },
    );
    await assert.rejects(finalize(reassigned.revision), { code: "CONFLICT", message: /residents.*archived/ });
    await caller.tenants.reactivate({ id: tenantId });
    const completed = await finalize(reassigned.revision);
    assert.equal(completed.status, "scheduled");
    assert.equal(completed.unitId, otherUnitId);
    assert.equal(await prisma.invoice.count({ where: { leaseId: draft.id } }), 2);
  });

  for (const target of ["Unit", "Property", "Tenant"] as const) {
    await t.test(`lease finalization defeats a ${target} archive with a stale eligibility read`, async () => {
      const { unitId, propertyId, tenantId, createDraft } = await fixture();
      const draft = await createDraft();
      const barrier = pauseWrite(prisma, target, "update");
      const racingCaller = callerFor(barrier.client);
      const archive = {
        Unit: () => racingCaller.units.archive({ id: unitId }),
        Property: () => racingCaller.properties.archive({ id: propertyId }),
        Tenant: () => racingCaller.tenants.archive({ id: tenantId }),
      };
      const result = await compete(barrier, archive[target](), () =>
        caller.leases.finalizeDraft({ leaseId: draft.id, expectedRevision: 0 }),
      );
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.code, "CONFLICT");
      await assert.rejects(archive[target](), { code: "CONFLICT", message: /scheduled, active, or notice/ });
      assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: draft.id } })).status, "scheduled");
    });
  }

  await t.test("unit archive defeats finalization with a stale eligibility read", async () => {
    const { unitId, createDraft } = await fixture();
    const draft = await createDraft();
    const barrier = pauseWrite(prisma, "Lease", "updateMany");
    const result = await compete(
      barrier,
      callerFor(barrier.client).leases.finalizeDraft({ leaseId: draft.id, expectedRevision: 0 }),
      () => caller.units.archive({ id: unitId }),
    );
    assert.equal(result.status, "rejected");
    assert.equal(result.reason.code, "CONFLICT");
    assert.equal((await prisma.lease.findUniqueOrThrow({ where: { id: draft.id } })).status, "draft");
    assert.equal(await prisma.invoice.count({ where: { leaseId: draft.id } }), 0);
  });

  await t.test("maintenance edits retain archived links and reject new ones", async () => {
    const { unitId, otherUnitId, ticketInput } = await fixture();
    const ticket = await caller.maintenance.create(ticketInput);
    await caller.units.archive({ id: unitId });
    await caller.units.archive({ id: otherUnitId });
    await assert.rejects(caller.maintenance.create(ticketInput), { code: "CONFLICT" });
    await assert.rejects(caller.maintenance.update({ ...ticketInput, id: ticket.id, unitIds: [otherUnitId] }), {
      code: "CONFLICT",
    });
    await caller.maintenance.update({ ...ticketInput, id: ticket.id, unitIds: [], ticketTitle: "Updated title" });
    const saved = await prisma.maintenanceTicket.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { units: true },
    });
    assert.equal(saved.title, "Updated title");
    assert.deepEqual(
      saved.units.map(({ unitId }) => unitId),
      [unitId],
    );
  });

  for (const writer of ["note", "ticket", "ticket edit"] as const) {
    await t.test(`unit deletion preserves a concurrent ${writer}`, async () => {
      const { unitId, otherUnitId, ticketInput } = await fixture();
      const existing =
        writer === "ticket edit" ? await caller.maintenance.create({ ...ticketInput, unitIds: [otherUnitId] }) : null;
      const write = {
        note: () => caller.notes.create({ unitId, body: "Keep this note" }),
        ticket: () => caller.maintenance.create(ticketInput),
        "ticket edit": () =>
          caller.maintenance.update({ ...ticketInput, id: existing!.id, unitIds: [unitId, otherUnitId] }),
      };
      const barrier = pauseWrite(prisma, "Unit", "delete");
      const result = await compete(barrier, callerFor(barrier.client).units.delete({ id: unitId }), write[writer]);
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.code, "CONFLICT");
      assert.equal(await prisma.unit.count({ where: { id: unitId } }), 1);
      assert.equal(
        writer === "note"
          ? await prisma.note.count({ where: { unitId } })
          : await prisma.maintenanceTicketUnit.count({ where: { unitId } }),
        1,
      );
    });
  }

  for (const operation of ["property delete", "property editor removal"] as const) {
    await t.test(`${operation} preserves a concurrent unit note`, async () => {
      const { unitId, propertyId } = await fixture();
      const barrier = pauseWrite(prisma, "Unit", "deleteMany");
      const racingCaller = callerFor(barrier.client);
      const deletion =
        operation === "property delete"
          ? racingCaller.properties.delete({ id: propertyId })
          : racingCaller.properties.update({
              id: propertyId,
              name: "No units",
              propertyType: "Apartment",
              address: { line1: "1 Test Street", city: "Chicago", region: "IL", postalCode: "60601" },
              unitCount: 0,
              units: [],
            });
      const result = await compete(barrier, deletion, () => caller.notes.create({ unitId, body: "Keep this note" }));
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.code, "CONFLICT");
      assert.equal(await prisma.note.count({ where: { unitId } }), 1);
    });
  }
});
