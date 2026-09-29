import assert from "node:assert/strict";
import test from "node:test";
import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  type NotificationDelivery,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  markNotificationDeliveryFailed,
  markNotificationDeliverySending,
  markNotificationDeliverySent,
  recordNotificationDeliveryQueued,
} from "../notification-delivery.js";

function createDelivery(overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  const now = new Date("2026-09-26T12:00:00.000Z");

  return {
    id: 10,
    organizationId: 7,
    outboxEventId: 44,
    channel: NotificationDeliveryChannel.email,
    status: NotificationDeliveryStatus.queued,
    recipientId: 12,
    recipientType: "user",
    destination: "person@example.com",
    subject: "Verify your Parcelis email",
    idempotencyKey: "auth.register:7:token-123",
    attemptCount: 0,
    lastAttemptAt: null,
    providerMessageId: null,
    sentAt: null,
    failedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrismaMock(initialDelivery?: NotificationDelivery) {
  let delivery = initialDelivery;
  let insertedCount = 0;

  const prisma = {
    notificationDelivery: {
      createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        if (delivery?.outboxEventId === (data.outboxEventId as number)) {
          return { count: 0 };
        }
        delivery = createDelivery(data as Partial<NotificationDelivery>);
        insertedCount++;
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { outboxEventId: number } }) => {
        assert.equal(where.outboxEventId, delivery?.outboxEventId);
        return delivery;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { outboxEventId: number; status: { not: NotificationDeliveryStatus } };
        data: Record<string, unknown>;
      }) => {
        assert.ok(delivery);
        assert.equal(where.outboxEventId, delivery.outboxEventId);
        assert.deepEqual(where.status, { not: NotificationDeliveryStatus.sent });
        if (delivery.status === NotificationDeliveryStatus.sent) return { count: 0 };

        const nextAttemptCount =
          typeof data.attemptCount === "object" && data.attemptCount !== null && "increment" in data.attemptCount
            ? delivery.attemptCount + Number((data.attemptCount as { increment: number }).increment)
            : delivery.attemptCount;

        delivery = {
          ...delivery,
          ...data,
          attemptCount: nextAttemptCount,
        } as NotificationDelivery;

        return { count: 1 };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    getDelivery: () => {
      assert.ok(delivery);
      return delivery;
    },
    getInsertedCount: () => insertedCount,
  };
}

test("recordNotificationDeliveryQueued is idempotent by outbox event", async () => {
  const { prisma, getDelivery, getInsertedCount } = createPrismaMock();

  const tx = prisma as unknown as Prisma.TransactionClient;
  const input = {
    organizationId: 7,
    outboxEventId: 44,
    channel: NotificationDeliveryChannel.email,
    recipientId: 12,
    recipientType: "user",
    destination: "person@example.com",
    subject: "Verify your Parcelis email",
    idempotencyKey: "auth.register:7:token-123",
  };
  const first = await recordNotificationDeliveryQueued(tx, input);
  const second = await recordNotificationDeliveryQueued(tx, input);

  assert.equal(getInsertedCount(), 1);
  assert.equal(first.outboxEventId, 44);
  assert.equal(first.status, NotificationDeliveryStatus.queued);
  assert.strictEqual(second, first);
  assert.strictEqual(getDelivery(), first);
});

test("markNotificationDeliverySending increments attempt count", async () => {
  const { prisma, getDelivery } = createPrismaMock(createDelivery());

  const updated = await markNotificationDeliverySending(prisma, {
    outboxEventId: 44,
    attemptedAt: new Date("2026-09-26T12:05:00.000Z"),
  });

  assert.equal(updated.status, NotificationDeliveryStatus.sending);
  assert.equal(updated.attemptCount, 1);
  assert.equal(updated.lastAttemptAt?.toISOString(), "2026-09-26T12:05:00.000Z");
  assert.equal(getDelivery().status, NotificationDeliveryStatus.sending);
});

test("markNotificationDeliverySent stores provider message id", async () => {
  const { prisma } = createPrismaMock(createDelivery({ status: NotificationDeliveryStatus.sending, attemptCount: 1 }));

  const updated = await markNotificationDeliverySent(prisma, {
    outboxEventId: 44,
    providerMessageId: "msg-123",
    sentAt: new Date("2026-09-26T12:06:00.000Z"),
  });

  assert.equal(updated.status, NotificationDeliveryStatus.sent);
  assert.equal(updated.providerMessageId, "msg-123");
  assert.equal(updated.sentAt?.toISOString(), "2026-09-26T12:06:00.000Z");
  assert.equal(updated.lastError, null);
});

test("markNotificationDeliveryFailed stores error and failure time", async () => {
  const { prisma } = createPrismaMock(createDelivery({ status: NotificationDeliveryStatus.sending, attemptCount: 1 }));

  const updated = await markNotificationDeliveryFailed(prisma, {
    outboxEventId: 44,
    error: "SMTP unavailable",
    failedAt: new Date("2026-09-26T12:07:00.000Z"),
  });

  assert.equal(updated.status, NotificationDeliveryStatus.failed);
  assert.equal(updated.lastError, "SMTP unavailable");
  assert.equal(updated.failedAt?.toISOString(), "2026-09-26T12:07:00.000Z");
});

test("sent delivery remains terminal for stale sending, sent, and failed updates", async () => {
  const original = createDelivery({
    status: NotificationDeliveryStatus.sent,
    attemptCount: 1,
    providerMessageId: "msg-original",
    sentAt: new Date("2026-09-26T12:06:00.000Z"),
  });
  const { prisma, getDelivery } = createPrismaMock(original);

  assert.strictEqual(await markNotificationDeliverySending(prisma, { outboxEventId: 44 }), original);
  assert.strictEqual(
    await markNotificationDeliveryFailed(prisma, { outboxEventId: 44, error: "late failure" }),
    original,
  );
  assert.strictEqual(
    await markNotificationDeliverySent(prisma, { outboxEventId: 44, providerMessageId: "msg-late" }),
    original,
  );
  assert.strictEqual(getDelivery(), original);
  assert.equal(getDelivery().attemptCount, 1);
  assert.equal(getDelivery().providerMessageId, "msg-original");
});
