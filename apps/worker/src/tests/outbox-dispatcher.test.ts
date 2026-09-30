import assert from "node:assert/strict";
import test from "node:test";
import type { OutboxEvent, PrismaClient } from "@parcelis/db";
import type { Queue } from "bullmq";
import {
  dispatchOutboxEvent,
  reconcileDispatchedNotificationJobs,
  startOutboxDispatcher,
} from "../outbox-dispatcher.js";

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
    notificationDelivery: {
      findMany: async () => [],
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

test("an event with a mismatched payload organization fails before enqueueing", async () => {
  const event = createEvent({ payload: { organizationId: 8, leaseId: 35 } });
  const { prisma, getEvent } = createPrisma(event);
  const queue = { add: async () => assert.fail("Invalid organization must not be enqueued") } as unknown as Queue;
  await dispatchOutboxEvent(prisma, new Map([["leasing-notifications", queue]]), event);
  assert.equal(getEvent().status, "failed");
  assert.match(getEvent().lastError ?? "", /organization does not match/);
  assert.equal(getEvent().claimToken, null);
});

test("notification email events dispatch to account-notifications", async () => {
  const event = createEvent({
    eventType: "notification.email",
    payload: {
      organizationId: 7,
      recipientId: 9,
      recipientType: "tenant",
      email: "tenant@example.com",
      subject: "Reminder",
      body: "Your rent is due",
    },
  });
  const { prisma, getEvent } = createPrisma(event);
  const queue = {
    add: async (
      name: string,
      data: unknown,
      options: { jobId: string; attempts: number; backoff: { type: string; delay: number } },
    ) => {
      assert.equal(name, "notification.email.v1");
      assert.deepEqual(data, {
        organizationId: 7,
        recipientId: 9,
        recipientType: "tenant",
        email: "tenant@example.com",
        subject: "Reminder",
        body: "Your rent is due",
        outboxEventId: 21,
      });
      assert.equal(options.jobId, "outbox-event-21");
      assert.equal(options.attempts, 3);
      assert.deepEqual(options.backoff, { type: "exponential", delay: 1_000 });
      return {};
    },
  } as unknown as Queue;

  await dispatchOutboxEvent(prisma, new Map([["account-notifications", queue]]), event);

  assert.equal(getEvent().status, "dispatched");
  assert.equal(getEvent().claimToken, null);
});

test("reconciles dispatched email deliveries when their BullMQ job is missing", async () => {
  const event = createEvent({
    eventType: "notification.email",
    status: "dispatched",
    claimToken: null,
    lockedUntil: null,
    dispatchedAt: new Date("2026-09-26T00:00:00.000Z"),
    payload: {
      organizationId: 7,
      recipientId: 9,
      recipientType: "tenant",
      email: "tenant@example.com",
      subject: "Reminder",
      body: "Your rent is due",
    },
  });
  let readDeliveries = false;
  const prisma = {
    notificationDelivery: {
      findMany: async (args: {
        where: { status: { in: string[] }; outboxEvent: { is: { status: string } } };
        take: number;
      }) => {
        assert.deepEqual(args.where.status.in, ["queued", "sending"]);
        assert.equal(args.where.outboxEvent.is.status, "dispatched");
        assert.equal(args.take, 100);
        if (readDeliveries) return [];
        readDeliveries = true;
        return [{ id: 14, status: "queued", outboxEvent: event }];
      },
    },
  } as unknown as PrismaClient;
  const added: Array<{
    name: string;
    data: unknown;
    options: { jobId: string; attempts: number; backoff: { type: string; delay: number } };
  }> = [];
  const queue = {
    getJob: async (jobId: string) => {
      assert.equal(jobId, "outbox-event-21");
      return undefined;
    },
    add: async (
      name: string,
      data: unknown,
      options: { jobId: string; attempts: number; backoff: { type: string; delay: number } },
    ) => added.push({ name, data, options }),
  } as unknown as Queue;

  await reconcileDispatchedNotificationJobs(prisma, new Map([["account-notifications", queue]]));

  assert.deepEqual(added, [
    {
      name: "notification.email.v1",
      data: {
        organizationId: 7,
        recipientId: 9,
        recipientType: "tenant",
        email: "tenant@example.com",
        subject: "Reminder",
        body: "Your rent is due",
        outboxEventId: 21,
      },
      options: { jobId: "outbox-event-21", attempts: 3, backoff: { type: "exponential", delay: 1_000 } },
    },
  ]);
});

test("does not redispatch a notification when its BullMQ job still exists", async () => {
  const event = createEvent({
    eventType: "notification.email",
    status: "dispatched",
    claimToken: null,
    lockedUntil: null,
    dispatchedAt: new Date("2026-09-26T00:00:00.000Z"),
    payload: {
      organizationId: 7,
      recipientId: 9,
      recipientType: "tenant",
      email: "tenant@example.com",
      subject: "Reminder",
      body: "Your rent is due",
    },
  });
  let readDeliveries = false;
  const prisma = {
    notificationDelivery: {
      findMany: async () => {
        if (readDeliveries) return [];
        readDeliveries = true;
        return [{ id: 14, status: "sending", outboxEvent: event }];
      },
    },
  } as unknown as PrismaClient;
  let readded = false;
  const queue = {
    getJob: async () => ({ id: "outbox-event-21" }),
    add: async () => {
      readded = true;
    },
  } as unknown as Queue;

  await reconcileDispatchedNotificationJobs(prisma, new Map([["account-notifications", queue]]));
  assert.equal(readded, false);
});

test("recovery carries the accepted SMTP message ID into a replacement job", async () => {
  const event = createEvent({
    eventType: "notification.email",
    status: "dispatched",
    payload: {
      organizationId: 7,
      recipientId: 9,
      recipientType: "tenant",
      email: "tenant@example.com",
      subject: "Reminder",
      body: "Your rent is due",
    },
  });
  const prisma = {
    notificationDelivery: {
      findMany: async () => [{ id: 14, status: "sending", providerMessageId: "smtp-accepted-123", outboxEvent: event }],
    },
  } as unknown as PrismaClient;
  let recoveredData: unknown;
  const queue = {
    getJob: async () => undefined,
    add: async (_name: string, data: unknown) => {
      recoveredData = data;
    },
  } as unknown as Queue;

  await reconcileDispatchedNotificationJobs(prisma, new Map([["account-notifications", queue]]));

  assert.deepEqual(recoveredData, {
    organizationId: 7,
    recipientId: 9,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Reminder",
    body: "Your rent is due",
    outboxEventId: event.id,
    acceptedMessageId: "smtp-accepted-123",
  });
});

test("graceful shutdown drains the already claimed batch", { timeout: 10_000 }, async (t) => {
  const events = [
    createEvent({ id: 21, status: "pending", claimToken: null }),
    createEvent({ id: 22, status: "pending", claimToken: null }),
  ];
  const prisma = {
    outboxEvent: {
      findMany: async ({ select }: { select?: unknown }) =>
        select ? events.map(({ id }) => ({ id })) : events.map((event) => ({ ...event })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: number; claimToken?: string };
        data: Record<string, unknown>;
      }) => {
        const event = events.find((event) => event.id === where.id);
        if (!event || (where.claimToken && event.claimToken !== where.claimToken)) return { count: 0 };
        const { attemptCount, ...fields } = data;
        Object.assign(event, fields);
        if (attemptCount) event.attemptCount += (attemptCount as { increment: number }).increment;
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => events.find((event) => event.id === where.id),
    },
    notificationDelivery: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient;
  let releaseFirst!: () => void;
  let notifyStarted!: () => void;
  const firstJobStarted = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const firstJobReleased = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const jobIds: string[] = [];
  const queue = {
    add: async (_name: string, _data: unknown, options: { jobId: string }) => {
      jobIds.push(options.jobId);
      if (jobIds.length === 1) {
        notifyStarted();
        await firstJobReleased;
      }
      return {};
    },
  } as unknown as Queue;
  const stop = startOutboxDispatcher(prisma, new Map([["leasing-notifications", queue]]));
  t.after(async () => {
    releaseFirst();
    await stop();
  });
  await firstJobStarted;
  const stopping = stop();
  releaseFirst();
  await stopping;
  assert.deepEqual(jobIds, ["outbox-event-21", "outbox-event-22"]);
  assert.ok(events.every((event) => event.status === "dispatched" && event.claimToken === null));
});
