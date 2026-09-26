import assert from "node:assert/strict";
import test from "node:test";
import { OutboxEventStatus, type OutboxEvent, type PrismaClient } from "@prisma/client";
import { claimAvailableOutboxEvents, getOutboxRetryDelayMs, replayFailedOutboxEvent } from "../outbox.js";

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

function createPrismaMock(initialEvent: OutboxEvent) {
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
          const isPendingAndDue =
            event.status === OutboxEventStatus.pending && event.availableAt <= new Date("2026-09-26T12:00:00.000Z");
          const isProcessingAndExpired =
            event.status === OutboxEventStatus.processing &&
            (event.lockedUntil === null || event.lockedUntil <= new Date("2026-09-26T12:00:00.000Z"));

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
        const eligible =
          event.status === OutboxEventStatus.pending ||
          (event.status === OutboxEventStatus.processing &&
            (event.lockedUntil === null || event.lockedUntil <= new Date("2026-09-26T12:00:00.000Z")));

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
  assert.equal(replayed.lastError, "Unsupported outbox event.");
});
