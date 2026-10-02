import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "@parcelis/db";
import { leaseReconciliationJobName } from "@parcelis/jobs";
import type { Queue } from "bullmq";
import {
  activateScheduledLease,
  endExpiredLease,
  isFinalLeaseJobAttempt,
  recordLeaseLifecycleFailure,
  reconcileLeaseLifecycle,
  startLeaseReconciler,
} from "../lease-activation.js";

test("lease jobs record failures only after their last configured attempt", () => {
  assert.equal(isFinalLeaseJobAttempt(0, 3), false);
  assert.equal(isFinalLeaseJobAttempt(1, 3), false);
  assert.equal(isFinalLeaseJobAttempt(2, 3), true);
  assert.equal(isFinalLeaseJobAttempt(0), true);
});

function createDatabase(input: {
  startsOn: Date;
  status?: string;
  occupiedLeaseId?: number;
  previousStatus?: "active" | "notice";
  previousEndsOn?: Date;
  timeZone?: string;
}) {
  let status = input.status ?? "scheduled";
  let previousStatus: string | null = input.occupiedLeaseId ? (input.previousStatus ?? "active") : null;
  let occupiedUnits = input.occupiedLeaseId ? 1 : 0;
  const activity: Array<{ subjectId: number; action: string }> = [];
  const tx = {
    activityEvent: {
      create: async ({ data }: { data: { subjectId: number; action: string } }) => {
        activity.push({ subjectId: data.subjectId, action: data.action });
        return { id: activity.length };
      },
    },
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
  return {
    prisma,
    current: () => ({ status, occupiedUnits }),
    previous: () => previousStatus,
    activity: () => activity,
  };
}

test("activation changes status and occupancy only once", async () => {
  const { prisma, current, activity } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(await activateScheduledLease(prisma, 7, 9, now), true);
  assert.equal(await activateScheduledLease(prisma, 7, 9, now), false);
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
  assert.deepEqual(activity(), [{ subjectId: 9, action: "lease.activated" }]);
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
  const { prisma, current, previous, activity } = createDatabase({
    startsOn: new Date("2026-10-01T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousEndsOn: new Date("2026-09-30T00:00:00.000Z"),
  });
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-01T12:00:00.000Z")), true);
  assert.equal(previous(), "ended");
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
  assert.deepEqual(activity(), [
    { subjectId: 30, action: "lease.expired" },
    { subjectId: 9, action: "lease.activated" },
  ]);
});

test("activation ends an expired predecessor on notice", async () => {
  const { prisma, current, previous } = createDatabase({
    startsOn: new Date("2026-10-02T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousStatus: "notice",
    previousEndsOn: new Date("2026-10-01T00:00:00.000Z"),
  });
  assert.equal(await activateScheduledLease(prisma, 7, 9, new Date("2026-10-02T12:00:00.000Z")), true);
  assert.equal(previous(), "ended");
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("an open-ended predecessor blocks activation", async () => {
  const { prisma, current, previous } = createDatabase({
    startsOn: new Date("2026-10-02T00:00:00.000Z"),
    occupiedLeaseId: 30,
    previousStatus: "notice",
  });
  await assert.rejects(activateScheduledLease(prisma, 7, 9, new Date("2026-10-02T12:00:00.000Z")), /lease 30/);
  assert.equal(previous(), "notice");
  assert.deepEqual(current(), { status: "scheduled", occupiedUnits: 1 });
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
    activityEvent: { create: async () => ({ id: 1 }) },
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

test("a fixed-term lease continuing month to month is not expired", async () => {
  const prisma = {
    $transaction: async (callback: (client: unknown) => Promise<unknown>) =>
      callback({
        lease: {
          findFirst: async () => ({
            id: 30,
            organizationId: 7,
            status: "notice",
            termType: "fixed",
            continueMonthToMonthAfterEnd: true,
            endsOn: new Date("2026-10-01T00:00:00.000Z"),
            organization: { timeZone: "UTC" },
          }),
          updateMany: async () => assert.fail("continuing lease must not be ended"),
        },
      }),
  } as unknown as PrismaClient;
  assert.equal(await endExpiredLease(prisma, 7, 30, new Date("2026-10-02T12:00:00.000Z")), false);
});

test("activation retries a serialization conflict without duplicating occupancy", async () => {
  const { prisma, current, activity } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  const transaction = prisma.$transaction.bind(prisma);
  let attempts = 0;
  const conflictingPrisma = {
    $transaction: async (...args: Parameters<typeof transaction>) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "0" });
      }
      return transaction(...args);
    },
  } as unknown as PrismaClient;
  assert.equal(await activateScheduledLease(conflictingPrisma, 7, 9, new Date("2026-10-01T12:00:00.000Z")), true);
  assert.equal(attempts, 2);
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
  assert.deepEqual(activity(), [{ subjectId: 9, action: "lease.activated" }]);
});

test("lifecycle failures are recorded once with a safe message", async () => {
  const events: Array<{ organizationId: number; subjectId: number; action: string; metadata: { message: string } }> =
    [];
  const prisma = {
    lease: { findFirst: async () => ({ propertyId: 2 }) },
    activityEvent: {
      findFirst: async () => events.at(-1) ?? null,
      create: async ({ data }: { data: (typeof events)[number] }) => {
        events.push(data);
        return { id: events.length };
      },
    },
  } as unknown as PrismaClient;
  const error = new Error("Scheduled lease 9 cannot activate while lease 30 occupies its unit.");
  await recordLeaseLifecycleFailure(prisma, 7, 9, "lease.activation_failed", error);
  await recordLeaseLifecycleFailure(prisma, 7, 9, "lease.activation_failed", error);
  assert.deepEqual(events, [
    {
      organizationId: 7,
      subjectType: "lease",
      subjectId: 9,
      subjectLabel: "Lease #9",
      propertyId: 2,
      action: "lease.activation_failed",
      metadata: { message: "Another active lease still occupies this unit." },
    },
  ]);
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

test("database reconciliation activates a lease after its organization timezone changes", async () => {
  const { prisma, current } = createDatabase({
    startsOn: new Date("2026-10-02T00:00:00.000Z"),
    timeZone: "America/Chicago",
  });
  await reconcileLeaseLifecycle(prisma, new Date("2026-10-02T02:00:00.000Z"));
  assert.deepEqual(current(), { status: "scheduled", occupiedUnits: 0 });
  await reconcileLeaseLifecycle(prisma, new Date("2026-10-02T05:00:00.000Z"));
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});

test("worker startup schedules recurring reconciliation and scans PostgreSQL", async () => {
  const { prisma, current } = createDatabase({ startsOn: new Date("2026-10-01T00:00:00.000Z") });
  const calls: Array<{ id: string; every: number; name: string }> = [];
  const queue = {
    upsertJobScheduler: async (id: string, repeat: { every: number }, template: { name: string }) => {
      calls.push({ id, every: repeat.every, name: template.name });
    },
  } as unknown as Queue;
  const stop = startLeaseReconciler(prisma, queue);
  await stop();
  assert.deepEqual(calls, [{ id: leaseReconciliationJobName, every: 60_000, name: leaseReconciliationJobName }]);
  assert.deepEqual(current(), { status: "active", occupiedUnits: 1 });
});
