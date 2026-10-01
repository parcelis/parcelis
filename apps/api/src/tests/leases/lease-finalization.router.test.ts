import assert from "node:assert/strict";
import test from "node:test";
import { appRouter } from "../../router/app.router";
import type { Context } from "../../router/context";

function createCaller(prisma: unknown) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: 1, role: "administrator" } },
    organization: { organizationId: 7 },
  } as unknown as Context);
}

function calendarDay(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

function draft(startsOn: Date) {
  return {
    id: 9,
    organizationId: 7,
    status: "draft",
    revision: 4,
    archivedAt: null,
    propertyId: 2,
    unitId: 3,
    termType: "fixed",
    startsOn,
    endsOn: new Date(startsOn.getTime() + 30 * 86400000),
    monthlyRentCents: 10000,
    securityDepositCents: 1000,
    rentDueDay: 1,
    continueMonthToMonthAfterEnd: false,
    billingResponsibility: "joint",
    allowPartialPayments: true,
    tenants: [{ tenantId: 11, rentShareCents: null, depositShareCents: null }],
  };
}

type ExistingLease = { startsOn: Date; endsOn: Date | null; status: string };

function createDatabase(
  start: Date,
  overlap = false,
  overrides: Record<string, unknown> = {},
  existingLease?: ExistingLease,
  predecessorOccupiedUnits = 1,
) {
  const lease = { ...draft(start), ...overrides };
  let created = false;
  let currentStatus = lease.status;
  let previousStatus = existingLease?.status;
  let occupiedIncrements = 0;
  let occupiedUnits = existingLease ? predecessorOccupiedUnits : 0;
  let outboxWrites = 0;
  let invoiceWrites = 0;
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        assert.equal(where.organizationId, 7);
        if (where.unitId) {
          assert.deepEqual(where.id, { not: lease.id });
          if (where.endsOn) {
            assert.deepEqual(where.endsOn, { lt: lease.startsOn });
            return existingLease?.endsOn &&
              existingLease.endsOn < lease.startsOn &&
              ["active", "notice"].includes(previousStatus ?? "")
              ? { id: 30, status: previousStatus, propertyId: 2 }
              : null;
          }
          assert.deepEqual(where.status, { in: ["active", "notice", "scheduled"] });
          assert.deepEqual(where.startsOn, lease.endsOn ? { lte: lease.endsOn } : undefined);
          assert.deepEqual(where.OR, [{ endsOn: null }, { endsOn: { gte: lease.startsOn } }]);
          if (overlap) return { id: 30 };
          if (!existingLease) return null;
          const startsBeforeEnd = !lease.endsOn || existingLease.startsOn <= lease.endsOn;
          const endsAfterStart = !existingLease.endsOn || existingLease.endsOn >= lease.startsOn;
          const eligibleStatus = ["active", "notice", "scheduled"].includes(previousStatus ?? "");
          return startsBeforeEnd && endsAfterStart && eligibleStatus ? { id: 30 } : null;
        }
        return { ...lease, status: currentStatus, revision: created ? 5 : 4 };
      },
      create: async () => {
        throw new Error("Finalization must not create another lease.");
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; organizationId: number; status?: string; revision?: number };
        data: { status: string };
      }) => {
        if (where.id === 30) {
          assert.deepEqual(where, { id: 30, organizationId: 7, status: previousStatus });
          assert.deepEqual(data, { status: "ended" });
          previousStatus = data.status;
          return { count: 1 };
        }
        assert.equal(where.id, 9);
        assert.equal(where.organizationId, 7);
        assert.equal(where.revision, 4);
        currentStatus = data.status;
        created = true;
        return { count: 1 };
      },
      findFirstOrThrow: async () => ({ ...lease, status: currentStatus, revision: 5 }),
    },
    property: {
      findFirstOrThrow: async () => ({ id: 2 }),
      update: async () => {
        occupiedIncrements += 1;
        occupiedUnits += 1;
        return { id: 2 };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; organizationId: number; occupiedUnits: { gt: number } };
        data: { occupiedUnits: { decrement: number } };
      }) => {
        assert.deepEqual(where, { id: 2, organizationId: 7, occupiedUnits: { gt: 0 } });
        assert.deepEqual(data, { occupiedUnits: { decrement: 1 } });
        if (occupiedUnits <= 0) return { count: 0 };
        occupiedIncrements -= 1;
        occupiedUnits -= 1;
        return { count: 1 };
      },
    },
    unit: { findFirstOrThrow: async () => ({ id: 3 }) },
    tenant: { findMany: async () => [{ id: 11 }] },
    outboxEvent: {
      createMany: async () => {
        outboxWrites += 1;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        eventType: "lease.activate",
        schemaVersion: 1,
        payload: { organizationId: 7, leaseId: 9 },
      }),
    },
    invoice: {
      create: async () => {
        invoiceWrites += 1;
        throw new Error("Finalization must not create an invoice.");
      },
    },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
  return {
    caller: createCaller(prisma),
    counts: () => ({ occupiedIncrements, outboxWrites }),
    invoiceWrites: () => invoiceWrites,
    previousStatus: () => previousStatus,
  };
}

test("finalizes today's draft in place and increments occupancy once", async () => {
  const { caller, counts } = createDatabase(calendarDay(0));
  const input = { leaseId: 9, expectedRevision: 4 };
  const first = await caller.leases.finalizeDraft(input);
  const repeated = await caller.leases.finalizeDraft(input);
  assert.equal(first.id, 9);
  assert.equal(first.status, "active");
  assert.equal(repeated.id, 9);
  assert.deepEqual(counts(), { occupiedIncrements: 1, outboxWrites: 0 });
});

test("finalizes a future draft as scheduled and records one activation event", async () => {
  const { caller, counts } = createDatabase(calendarDay(10));
  const input = { leaseId: 9, expectedRevision: 4 };
  const first = await caller.leases.finalizeDraft(input);
  await caller.leases.finalizeDraft(input);
  assert.equal(first.status, "scheduled");
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 1 });
});

test("rejects overlapping dates without changing the draft", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), true);
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects an incomplete draft and preserves its data", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { monthlyRentCents: null });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "BAD_REQUEST",
    message: /Residents and billing/,
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects stale draft revisions", async () => {
  const { caller, counts } = createDatabase(calendarDay(0));
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 3 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects a discarded draft", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { archivedAt: new Date() });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "NOT_FOUND",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects a lease outside the draft state", async () => {
  const { caller, counts } = createDatabase(calendarDay(0), false, { status: "notice" });
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("allows a lease starting after the previous lease ends", async () => {
  const start = calendarDay(10);
  const { caller } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(-30),
      endsOn: calendarDay(9),
      status: "active",
    },
  );
  const lease = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(lease.status, "scheduled");
});

test("immediate finalization ends an expired predecessor and transfers occupancy", async () => {
  const start = calendarDay(0);
  const { caller, counts, previousStatus } = createDatabase(
    start,
    false,
    {},
    { startsOn: calendarDay(-30), endsOn: calendarDay(-1), status: "active" },
  );
  const lease = await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(lease.status, "active");
  assert.equal(previousStatus(), "ended");
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("immediate finalization rejects inconsistent predecessor occupancy", async () => {
  const start = calendarDay(0);
  const { caller, counts } = createDatabase(
    start,
    false,
    {},
    { startsOn: calendarDay(-30), endsOn: calendarDay(-1), status: "active" },
    0,
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), /occupancy is inconsistent/);
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects overlap with an open-ended lease", async () => {
  const start = calendarDay(10);
  const { caller, counts } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(-30),
      endsOn: null,
      status: "notice",
    },
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
  assert.deepEqual(counts(), { occupiedIncrements: 0, outboxWrites: 0 });
});

test("rejects overlap with a scheduled lease", async () => {
  const start = calendarDay(10);
  const { caller } = createDatabase(
    start,
    false,
    {},
    {
      startsOn: calendarDay(20),
      endsOn: calendarDay(50),
      status: "scheduled",
    },
  );
  await assert.rejects(caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 }), {
    code: "CONFLICT",
  });
});

test("does not generate invoices when completing a draft", async () => {
  const { caller, invoiceWrites } = createDatabase(calendarDay(0));
  await caller.leases.finalizeDraft({ leaseId: 9, expectedRevision: 4 });
  assert.equal(invoiceWrites(), 0);
});
