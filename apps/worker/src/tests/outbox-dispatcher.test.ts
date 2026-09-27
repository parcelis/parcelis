import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxEvent, PrismaClient } from "@parcelis/db";
import type { Queue } from "bullmq";
import { dispatchOutboxEvent } from "../outbox-dispatcher.js";

function createEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 21,
    organizationId: 7,
    eventType: "lease.activate",
    schemaVersion: 1,
    payload: { organizationId: 7, leaseId: 35 },
    idempotencyKey: "lease:35:activate",
    availableAt: new Date(0),
    status: "processing",
    attemptCount: 1,
    lastAttemptAt: new Date("2026-09-26T00:00:00.000Z"),
    lockedUntil: new Date("2026-09-26T00:01:00.000Z"),
    claimToken: "claim-21",
    dispatchedAt: null,
    failedAt: null,
    lastError: null,
    createdAt: new Date("2026-09-26T00:00:00.000Z"),
    updatedAt: new Date("2026-09-26T00:00:00.000Z"),
    ...overrides,
  };
}

function createPrisma(event: OutboxEvent, failDispatchedUpdate = false) {
  let current = event;
  let shouldFailDispatchedUpdate = failDispatchedUpdate;

  const prisma = {
    outboxEvent: {
      findFirstOrThrow: async () => ({ attemptCount: current.attemptCount }),
      findUniqueOrThrow: async () => current,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; claimToken: string };
        data: Record<string, unknown>;
      }) => {
        if (where.id !== current.id || where.claimToken !== current.claimToken) return { count: 0 };
        if (data.status === "dispatched" && shouldFailDispatchedUpdate) {
          shouldFailDispatchedUpdate = false;
          return { count: 0 };
        }

        current = { ...current, ...data } as OutboxEvent;
        return { count: 1 };
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, getEvent: () => current };
}

test("redis failure reschedules the event without losing it", async () => {
  const event = createEvent();
  const { prisma, getEvent } = createPrisma(event);
  const queue = {
    add: async () => {
      throw new Error("Redis unavailable");
    },
  } as unknown as Queue;

  await dispatchOutboxEvent(prisma, new Map([["leasing-notifications", queue]]), event);

  assert.equal(getEvent().status, "pending");
  assert.equal(getEvent().lastError, "Redis unavailable");
  assert.equal(getEvent().claimToken, null);
  assert.ok(getEvent().availableAt > event.availableAt);
});

test("malformed or unsupported events are retained as failed", async () => {
  const event = createEvent({ eventType: "unknown.event" });
  const { prisma, getEvent } = createPrisma(event);

  await dispatchOutboxEvent(prisma, new Map(), event);

  assert.equal(getEvent().status, "failed");
  assert.match(getEvent().lastError ?? "", /Unsupported outbox event/);
  assert.equal(getEvent().claimToken, null);
});

test("a retry after enqueue succeeds uses the same BullMQ job ID", async () => {
  const event = createEvent();
  const { prisma } = createPrisma(event, true);
  const jobIds: string[] = [];
  const queue = {
    add: async (_name: string, _data: unknown, options: { jobId: string }) => {
      jobIds.push(options.jobId);
      return {};
    },
  } as unknown as Queue;
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await dispatchOutboxEvent(prisma, new Map([["leasing-notifications", queue]]), event);
    await dispatchOutboxEvent(prisma, new Map([["leasing-notifications", queue]]), event);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(jobIds, ["outbox-event-21", "outbox-event-21"]);
});
