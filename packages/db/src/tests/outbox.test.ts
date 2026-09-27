import assert from "node:assert/strict";
import test from "node:test";
import { OutboxEventStatus, Prisma, type OutboxEvent, type PrismaClient } from "@prisma/client";
import {
  claimAvailableOutboxEvents,
  getOutboxRetryDelayMs,
  markOutboxEventDispatched,
  markOutboxEventFailed,
  rescheduleOutboxEvent,
  recordOutboxEvent,
  replayFailedOutboxEvent,
} from "../outbox.js";

function createEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  const now = new Date("2026-09-26T12:00:00.000Z");

  return {
    id: 1,
    organizationId: 3,
    eventType: "lease.activate",
    schemaVersion: 1,
    payload: { organizationId: 3, leaseId: 14 },
    idempotencyKey: "lease:14:activate",
    availableAt: now,
    status: OutboxEventStatus.pending,
    attemptCount: 0,
    lastAttemptAt: null,
    lockedUntil: null,
    claimToken: null,
    dispatchedAt: null,
    failedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrismaMock(initialEvent: OutboxEvent, now = new Date("2026-09-26T12:00:00.000Z")) {
  const expectedWhere = {
    OR: [
      { status: "pending", availableAt: { lte: now } },
      { status: "processing", OR: [{ lockedUntil: { lte: now } }, { lockedUntil: null }] },
    ],
  };
  let event = initialEvent;

  const prisma = {
    outboxEvent: {
      findMany: async (args: {
        where: {
          OR?: Array<Record<string, unknown>>;
          id?: { in: number[] };
          status?: OutboxEventStatus;
          claimToken?: string;
        };
        select?: { id: true };
        take?: number;
      }) => {
        if (args.select?.id) {
          assert.deepEqual(args.where, expectedWhere);
          const isPendingAndDue = event.status === OutboxEventStatus.pending && event.availableAt <= now;
          const isProcessingAndExpired =
            event.status === OutboxEventStatus.processing && (event.lockedUntil === null || event.lockedUntil <= now);

          return isPendingAndDue || isProcessingAndExpired ? [{ id: event.id }].slice(0, args.take) : [];
        }

        const matchesId = !args.where.id || args.where.id.in.includes(event.id);
        const matchesStatus = !args.where.status || args.where.status === event.status;
        const matchesClaim = !args.where.claimToken || args.where.claimToken === event.claimToken;
        return matchesId && matchesStatus && matchesClaim ? [event] : [];
      },
      updateMany: async (args: {
        where: { id: number; OR: Array<Record<string, unknown>> };
        data: {
          status: OutboxEventStatus;
          attemptCount: { increment: number };
          lastAttemptAt: Date;
          lockedUntil: Date;
          claimToken: string;
        };
      }) => {
        assert.deepEqual(args.where, { id: event.id, ...expectedWhere });
        const eligible =
          (event.status === OutboxEventStatus.pending && event.availableAt <= now) ||
          (event.status === OutboxEventStatus.processing && (event.lockedUntil === null || event.lockedUntil <= now));

        if (args.where.id !== event.id || !eligible) return { count: 0 };

        event = {
          ...event,
          status: args.data.status,
          attemptCount: event.attemptCount + args.data.attemptCount.increment,
          lastAttemptAt: args.data.lastAttemptAt,
          lockedUntil: args.data.lockedUntil,
          claimToken: args.data.claimToken,
        };

        return { count: 1 };
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, getEvent: () => event };
}

test("concurrent dispatchers cannot claim the same event", async () => {
  const { prisma, getEvent } = createPrismaMock(createEvent());

  const claims = await Promise.all([
    claimAvailableOutboxEvents(prisma, {
      now: new Date("2026-09-26T12:00:00.000Z"),
      claimToken: "dispatcher-one",
    }),
    claimAvailableOutboxEvents(prisma, {
      now: new Date("2026-09-26T12:00:00.000Z"),
      claimToken: "dispatcher-two",
    }),
  ]);

  assert.equal(claims[0].length + claims[1].length, 1);
  assert.equal(getEvent().status, OutboxEventStatus.processing);
  assert.ok(["dispatcher-one", "dispatcher-two"].includes(getEvent().claimToken ?? ""));
});

test("a crashed dispatcher event becomes claimable after its lock expires", async () => {
  const { prisma, getEvent } = createPrismaMock(
    createEvent({
      status: OutboxEventStatus.processing,
      attemptCount: 1,
      claimToken: "stale-claim",
      lockedUntil: new Date("2026-09-26T11:59:00.000Z"),
    }),
  );

  const claimed = await claimAvailableOutboxEvents(prisma, {
    now: new Date("2026-09-26T12:00:00.000Z"),
    claimToken: "replacement-claim",
  });

  assert.equal(claimed.length, 1);
  assert.equal(getEvent().claimToken, "replacement-claim");
  assert.equal(getEvent().attemptCount, 2);
});

test("retry delay grows exponentially and stops at fifteen minutes", () => {
  assert.equal(getOutboxRetryDelayMs(1), 1_000);
  assert.equal(getOutboxRetryDelayMs(2), 2_000);
  assert.equal(getOutboxRetryDelayMs(4), 8_000);
  assert.equal(getOutboxRetryDelayMs(20), 15 * 60_000);
});

test("authorized replay returns a failed event to pending without resetting its attempts", async () => {
  let event = createEvent({
    status: OutboxEventStatus.failed,
    attemptCount: 4,
    failedAt: new Date("2026-09-26T11:00:00.000Z"),
    lastError: "Unsupported outbox event.",
    lockedUntil: new Date("2026-09-26T11:01:00.000Z"),
    claimToken: "expired",
  });
  const now = new Date("2026-09-26T12:30:00.000Z");
  const prisma = {
    outboxEvent: {
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        assert.equal(where.organizationId, event.organizationId);
        assert.equal(where.status, OutboxEventStatus.failed);
        event = { ...event, ...data } as OutboxEvent;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => event,
    },
  } as unknown as PrismaClient;

  const replayed = await replayFailedOutboxEvent(prisma, {
    organizationId: event.organizationId,
    eventId: event.id,
    availableAt: now,
  });

  assert.ok(replayed);
  assert.equal(replayed.status, OutboxEventStatus.pending);
  assert.equal(replayed.availableAt, now);
  assert.equal(replayed.attemptCount, 4);
  assert.equal(replayed.failedAt, null);
  assert.equal(replayed.lockedUntil, null);
  assert.equal(replayed.claimToken, null);
  assert.equal(replayed.lastError, "Unsupported outbox event.");
});

test("recording the same outbox idempotency key preserves the original event and schedule", async () => {
  let storedEvent: Record<string, unknown> | null = null;
  let insertCount = 0;
  const tx = {
    outboxEvent: {
      createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        if (storedEvent) return { count: 0 };
        insertCount += 1;
        storedEvent = {
          id: 13,
          ...data,
          schemaVersion: 1,
          status: OutboxEventStatus.pending,
          attemptCount: 0,
          lastAttemptAt: null,
          lockedUntil: null,
          claimToken: null,
          dispatchedAt: null,
          failedAt: null,
          lastError: null,
          createdAt: new Date("2026-09-26T12:00:00.000Z"),
          updatedAt: new Date("2026-09-26T12:00:00.000Z"),
        };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => storedEvent,
    },
  } as unknown as Prisma.TransactionClient;
  const input = {
    organizationId: 3,
    eventType: "lease.activate",
    schemaVersion: 1,
    payload: { organizationId: 3, leaseId: 14 } satisfies Prisma.InputJsonValue,
    idempotencyKey: "lease:14:activate",
    availableAt: new Date("2026-09-26T12:00:00Z"),
  };

  const first = await recordOutboxEvent(tx, input);
  const second = await recordOutboxEvent(tx, { ...input, availableAt: new Date("2030-01-01T00:00:00Z") });

  assert.equal(insertCount, 1);
  assert.equal(first.id, second.id);
  assert.equal(second.id, 13);
  assert.equal(second.availableAt, input.availableAt);
});

test("recording the same outbox idempotency key with a different payload is rejected", async () => {
  let storedEvent: Record<string, unknown> | null = null;
  const tx = {
    outboxEvent: {
      createMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (storedEvent) return { count: 0 };
        storedEvent = { id: 13, ...data };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => storedEvent,
    },
  } as unknown as Prisma.TransactionClient;
  const input = {
    organizationId: 3,
    eventType: "lease.activate",
    schemaVersion: 1,
    payload: { organizationId: 3, leaseId: 14 } satisfies Prisma.InputJsonValue,
    idempotencyKey: "lease:14:activate",
  };

  await recordOutboxEvent(tx, input);
  await assert.rejects(
    recordOutboxEvent(tx, { ...input, payload: { organizationId: 3, leaseId: 15 } }),
    /already used by a different event/,
  );
});

test("claim queries use the supplied clock and exclude future events and active locks", async () => {
  const now = new Date("2030-01-01T00:00:00Z");
  for (const event of [
    createEvent({ availableAt: new Date(now.getTime() + 1) }),
    createEvent({ status: OutboxEventStatus.processing, lockedUntil: new Date(now.getTime() + 1) }),
  ]) {
    const { prisma } = createPrismaMock(event, now);
    assert.deepEqual(await claimAvailableOutboxEvents(prisma, { now }), []);
  }
  const { prisma, getEvent } = createPrismaMock(createEvent({ availableAt: now }), now);
  assert.equal((await claimAvailableOutboxEvents(prisma, { now, lockDurationMs: 1234 })).length, 1);
  assert.equal(getEvent().lockedUntil?.getTime(), now.getTime() + 1234);
});

for (const operation of ["dispatched", "failed", "rescheduled"] as const) {
  for (const validClaim of [true, false]) {
    test(`${operation} updates require a current processing claim (${validClaim})`, async () => {
      const now = new Date("2030-01-01T00:00:00Z");
      const input = { id: 1, claimToken: "current-claim" };
      let updatedData: Record<string, unknown> | undefined;
      const where = { ...input, status: "processing" };
      const prisma = {
        outboxEvent: {
          findFirstOrThrow: async (args: { where: unknown }) => {
            assert.deepEqual(args.where, where);
            return { attemptCount: 3 };
          },
          updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
            assert.deepEqual(args.where, where);
            updatedData = args.data;
            return { count: validClaim ? 1 : 0 };
          },
          findUniqueOrThrow: async (args: { where: unknown }) => {
            assert.ok(validClaim);
            assert.deepEqual(args.where, { id: 1 });
            return createEvent(updatedData as Partial<OutboxEvent>);
          },
        },
      } as unknown as PrismaClient;
      const result =
        operation === "dispatched"
          ? markOutboxEventDispatched(prisma, { ...input, dispatchedAt: now })
          : operation === "failed"
            ? markOutboxEventFailed(prisma, { ...input, failedAt: now, error: "bad payload" })
            : rescheduleOutboxEvent(prisma, { ...input, now, error: "Redis unavailable" });
      if (!validClaim) {
        await assert.rejects(result, /Outbox event claim is no longer valid/);
        return;
      }
      await result;
      const expected =
        operation === "dispatched"
          ? { status: "dispatched", dispatchedAt: now, lastError: null }
          : operation === "failed"
            ? { status: "failed", failedAt: now, lastError: "bad payload" }
            : {
                status: "pending",
                availableAt: new Date(now.getTime() + 4000),
                failedAt: null,
                lastError: "Redis unavailable",
              };
      assert.deepEqual(updatedData, { ...expected, lockedUntil: null, claimToken: null });
    });
  }
}
