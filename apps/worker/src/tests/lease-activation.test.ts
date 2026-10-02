import assert from "node:assert/strict";
import test from "node:test";
import { type PrismaClient } from "@parcelis/db";
import { activateScheduledLease, endExpiredLease, reconcileLeaseLifecycle } from "../lease-activation.js";

function createDatabase(input: {
  startsOn: Date;
  status?: string;
  occupiedLeaseId?: number;
  previousEndsOn?: Date;
  timeZone?: string;
}) {
  let status = input.status ?? "scheduled";
  let previousStatus = input.occupiedLeaseId ? "active" : null;
  let occupiedUnits = input.occupiedLeaseId ? 1 : 0;
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: { id?: number; organizationId: number; unitId?: number } }) => {
        assert.equal(where.organizationId, 7);
        if (where.id === input.occupiedLeaseId) {
          return {
            id: input.occupiedLeaseId,
            organizationId: 7,
            propertyId: 2,
            status: previousStatus,
            termType: "fixed",
            continueMonthToMonthAfterEnd: false,
            endsOn: input.previousEndsOn ?? null,
            organization: { timeZone: input.timeZone ?? "UTC" },
          };
        }
        if (where.unitId)
          return previousStatus === "active" || previousStatus === "notice"
            ? { id: input.occupiedLeaseId, status: previousStatus, propertyId: 2, endsOn: input.previousEndsOn ?? null }
            : null;
        return {
          id: 9,
          organizationId: 7,
          propertyId: 2,
          unitId: 3,
          startsOn: input.startsOn,
          status,
          organization: { timeZone: input.timeZone ?? "UTC" },
        };
      },
      updateMany: async ({ where, data }: { where: { id: number; status: string }; data: { status: string } }) => {
        if (where.id === input.occupiedLeaseId) {
          if (where.status !== previousStatus) return { count: 0 };
          previousStatus = data.status;
          return { count: 1 };
        }
        if (where.status !== status) return { count: 0 };
        status = data.status;
        return { count: 1 };
      },
    },
    property: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; organizationId: number };
        data: { occupiedUnits: { increment?: number; decrement?: number } };
      }) => {
        assert.equal(where.id, 2);
        assert.equal(where.organizationId, 7);
        occupiedUnits += data.occupiedUnits.increment ?? -(data.occupiedUnits.decrement ?? 0);
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    lease: {
      findMany: async ({
        where,
      }: {
        where: { status: string | { in: string[] }; startsOn?: { lt: Date }; endsOn?: { lt: Date } };
      }) => {
        if (typeof where.status === "object") {
          return previousStatus === "active" && input.previousEndsOn && input.previousEndsOn < where.endsOn!.lt
            ? [{ id: input.occupiedLeaseId, organizationId: 7 }]
            : [];
        }
        return status === "scheduled" && input.startsOn < where.startsOn!.lt ? [{ id: 9, organizationId: 7 }] : [];
      },
    },
  } as unknown as PrismaClient;
  return { prisma, current: () => ({ status, occupiedUnits }), previous: () => previousStatus };
}

test("activation changes status and occupancy only once", async () => {
  const { prisma, current } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(await activateScheduledLease(prisma, 7, 9, now), true);
  assert.equal(await activateScheduledLease(prisma, 7, 9, now), false);
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("activation waits until the lease start", async () => {
  const { prisma, current } = createDatabase({ startsOn: new Date("2026-10-02T00:00:00.000Z") });
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-01T12:00:00.000Z")), false);
  assert.deepEqual(current(), { status: "scheduled", occupiedUnits: 0 });
});

test("activation waits for the organization's local start date", async () => {
  const { prisma, current } = createDatabase({
    startsOn: new Date("2026-10-02T00:00:00.000Z"),
    timeZone: "America/Chicago",
  });
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-02T02:00:00.000Z")), false);
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-02T05:00:00.000Z")), true);
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("an occupied unit keeps the lease scheduled for recovery", async () => {
  const { prisma, current } = createDatabase({
    startsOn: new Date("2026-10-01T00:00:00.000Z"),
    occupiedLeaseId: 30,
  });
  await assert.rejects(activateScheduledLease(prisma, 7, 9, new Date("2026-10-01T12:00:00.000Z")), /lease 30/);
  assert.deepEqual(current(), { status: "scheduled", occupiedUnits: 1 });
});

test("activation ends an expired predecessor and transfers occupancy", async () => {
  const { prisma, current, previous } = createDatabase({
    startsOn: new Date("2026-10-01T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousEndsOn: new Date("2026-09-30T00:00:00.000Z"),
  });
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-01T12:00:00.000Z")), true);
  assert.equal(previous(), "ended");
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("activation rejects a predecessor whose final local day has not passed", async () => {
  const { prisma, current } = createDatabase({
    startsOn: new Date("2026-10-02T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousEndsOn: new Date("2026-10-02T00:00:00.000Z"),
  });
  await assert.rejects(activateScheduledLease(prisma, 7, 9, new Date("2026-10-02T12:00:00.000Z")), /lease 30/);
  assert.deepEqual(current(), { status: "scheduled", occupiedUnits: 1 });
});

test("an eligible fixed-term lease ends once after its final local day", async () => {
  let status = "active";
  let occupiedUnits = 1;
  const tx = {
    lease: {
      findFirst: async () => ({
        id: 30,
        organizationId: 7,
        propertyId: 2,
        status,
        termType: "fixed",
        continueMonthToMonthAfterEnd: false,
        endsOn: new Date("2026-10-01T00:00:00.000Z"),
        organization: { timeZone: "America/Chicago" },
      }),
      updateMany: async ({ where }: { where: { organizationId: number; status: string } }) => {
        assert.equal(where.organizationId, 7);
        if (where.status !== status) return { count: 0 };
        status = "ended";
        return { count: 1 };
      },
    },
    property: {
      updateMany: async ({
        where,
      }: {
        where: { id: number; organizationId: number; occupiedUnits: { gt: number } };
      }) => {
        assert.deepEqual(where, { id: 2, organizationId: 7, occupiedUnits: { gt: 0 } });
        occupiedUnits -= 1;
        return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  assert.equal(await endExpiredLease(prisma, 7, 30, new Date("2026-10-02T02:00:00.000Z")), false);
  assert.equal(await endExpiredLease(prisma, 7, 30, new Date("2026-10-02T05:00:00.000Z")), true);
  assert.equal(await endExpiredLease(prisma, 7, 30, new Date("2026-10-02T05:00:00.000Z")), false);
  assert.deepEqual({ status, occupiedUnits }, { status: "ended", occupiedUnits: 0 });
});

test("reconciliation activates a due lease after a missing queue delivery", async () => {
  const { prisma, current } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  await reconcileLeaseLifecycle(prisma, new Date("2026-10-01T12:00:00.000Z"));
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("reconciliation ends a predecessor before activating its successor", async () => {
  const { prisma, current, previous } = createDatabase({
    startsOn: new Date("2026-10-01T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousEndsOn: new Date("2026-09-30T00:00:00.000Z"),
  });
  await reconcileLeaseLifecycle(prisma, new Date("2026-10-01T12:00:00.000Z"));
  assert.equal(previous(), "ended");
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});
