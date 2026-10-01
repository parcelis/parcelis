import assert from "node:assert/strict";
import test from "node:test";
import { type PrismaClient } from "@parcelis/db";
import { activateScheduledLease, reconcileScheduledLeases } from "../lease-activation.js";

function createDatabase(input: { startsOn: Date; status?: string; occupiedLeaseId?: number; previousEndsOn?: Date }) {
  let status = input.status ?? "scheduled";
  let previousStatus = input.occupiedLeaseId ? "active" : null;
  let occupiedUnits = input.occupiedLeaseId ? 1 : 0;
  const tx = {
    lease: {
      findFirst: async ({ where }: { where: { id?: number; organizationId: number; unitId?: number } }) => {
        assert.equal(where.organizationId, 7);
        if (where.unitId)
          return previousStatus
            ? { id: input.occupiedLeaseId, status: previousStatus, propertyId: 2, endsOn: input.previousEndsOn ?? null }
            : null;
        return { id: 9, organizationId: 7, propertyId: 2, unitId: 3, startsOn: input.startsOn, status };
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
      findMany: async ({ where }: { where: { startsOn: { lte: Date } } }) =>
        status === "scheduled" && input.startsOn <= where.startsOn.lte ? [{ id: 9, organizationId: 7 }] : [],
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

test("reconciliation activates a due lease after a missing queue delivery", async () => {
  const { prisma, current } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  await reconcileScheduledLeases(prisma, new Date("2026-10-01T12:00:00.000Z"));
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});
