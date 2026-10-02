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

test("lease activation events enqueue a delayed job", async () => {
  const activateAt = new Date(Date.now() + 60_000).toISOString();
  const event = createEvent({ payload: { organizationId: 7, leaseId: 35, activateAt } });
  const { prisma } = createPrisma(event);
  let delay = 0;
  const queue = {
    add: async (_name: string, _data: unknown, options: { delay: number }) => {
      delay = options.delay;
      return {};
    },
  } as unknown as Queue;

  const beforeDispatch = Date.now();
  await dispatchOutboxEvent(prisma, new Map([["leasing-notifications", queue]]), event);
  const afterDispatch = Date.now();

  assert.ok(delay <= Date.parse(activateAt) - beforeDispatch);
  assert.ok(delay >= Date.parse(activateAt) - afterDispatch);
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
  const deliveries = Array.from({ length: 101 }, (_, index) => ({
    id: index + 14,
    status: "queued",
    outboxEvent: { ...event, id: event.id + index },
  }));
  const cursors: number[] = [];
  const prisma = {
    notificationDelivery: {
      findMany: async (args: {
        where: { id: { gt: number }; status: { in: string[] }; outboxEvent: { is: { status: string } } };
        take: number;
      }) => {
        assert.deepEqual(args.where.status.in, ["queued", "sending"]);
        assert.equal(args.where.outboxEvent.is.status, "dispatched");
        assert.equal(args.take, 100);
        assert.equal(args.where.id.gt, [0, 113][cursors.length]);
        cursors.push(args.where.id.gt);
        return deliveries.filter((delivery) => delivery.id > args.where.id.gt).slice(0, args.take);
      },
    },
  } as unknown as PrismaClient;
  const added: Array<{
    name: string;
    data: unknown;
    options: { jobId: string; attempts: number; backoff: { type: string; delay: number } };
  }> = [];
  const queue = {
    getJob: async () => undefined,
    add: async (
      name: string,
      data: unknown,
      options: { jobId: string; attempts: number; backoff: { type: string; delay: number } },
    ) => added.push({ name, data, options }),
  } as unknown as Queue;

  await reconcileDispatchedNotificationJobs(prisma, new Map([["account-notifications", queue]]));

  assert.deepEqual(cursors, [0, 113]);
  assert.deepEqual(
    added,
    deliveries.map((delivery) => ({
      name: "notification.email.v1",
      data: {
        organizationId: 7,
        recipientId: 9,
        recipientType: "tenant",
        email: "tenant@example.com",
        subject: "Reminder",
        body: "Your rent is due",
        outboxEventId: delivery.outboxEvent.id,
      },
      options: {
        jobId: `outbox-event-${delivery.outboxEvent.id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
      },
    })),
  );
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
  const prisma = {
    notificationDelivery: {
      findMany: async () => [{ id: 14, status: "sending", outboxEvent: event }],
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

test("notification recovery processes a second page after a full batch", async () => {
  const payload = {
    organizationId: 7,
    recipientId: 9,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Reminder",
    body: "Your rent is due",
  };
  const delivery = (id: number) => ({
    id,
    status: "queued",
    outboxEvent: createEvent({ id: id + 1000, eventType: "notification.email", status: "dispatched", payload }),
  });
  const firstPage = Array.from({ length: 100 }, (_, index) => delivery(index + 1));
  const secondPage = [delivery(101)];
  const cursors: number[] = [];
  const prisma = {
    notificationDelivery: {
      findMany: async ({ where, take }: { where: { id: { gt: number } }; take: number }) => {
        cursors.push(where.id.gt);
        assert.equal(take, 100);
        return where.id.gt === 0 ? firstPage : secondPage;
      },
    },
  } as unknown as PrismaClient;
  const checkedJobIds: string[] = [];
  const queue = {
    getJob: async (jobId: string) => {
      checkedJobIds.push(jobId);
      return { id: jobId };
    },
    add: async () => assert.fail("Existing jobs must not be restored"),
  } as unknown as Queue;

  await reconcileDispatchedNotificationJobs(prisma, new Map([["account-notifications", queue]]));

  assert.deepEqual(cursors, [0, 100]);
  assert.equal(checkedJobIds.length, 101);
  assert.equal(checkedJobIds.at(-1), "outbox-event-1101");
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
