import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@parcelis/db";
import { queueNotificationEmailOutboxEvent } from "../../modules/notification-outbox";

function createTransactionClient() {
  let createManyData: Record<string, unknown> | undefined;
  let notificationDeliveryCreateManyData: Record<string, unknown> | undefined;
  let outboxEventId = 44;

  const tx = {
    outboxEvent: {
      createMany: async ({ data }: { data: Record<string, unknown> }) => {
        createManyData = data;
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { organizationId_idempotencyKey: unknown } }) => {
        const key = where.organizationId_idempotencyKey as { organizationId: number; idempotencyKey: string };
        return {
          id: outboxEventId,
          organizationId: key.organizationId,
          eventType: "notification.email",
          schemaVersion: 1,
          payload: {
            organizationId: key.organizationId,
            recipientId: 5,
            recipientType: "tenant",
            email: "tenant@example.com",
            subject: "Lease reminder",
            body: "Your lease renews soon.",
          },
          idempotencyKey: key.idempotencyKey,
        };
      },
    },
    notificationDelivery: {
      createMany: async ({ data }: { data: Record<string, unknown> }) => {
        notificationDeliveryCreateManyData = data;
        if (typeof data.outboxEventId === "number") {
          outboxEventId = data.outboxEventId;
        }
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { outboxEventId: number } }) => ({
        id: 77,
        organizationId: 7,
        outboxEventId: where.outboxEventId,
        channel: "email",
        status: "queued",
        recipientId: 5,
        recipientType: "tenant",
        destination: "tenant@example.com",
        subject: "Lease reminder",
        idempotencyKey: "verify-email:7:abc123",
      }),
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    getCreateManyData: () => createManyData,
    getNotificationDeliveryCreateManyData: () => notificationDeliveryCreateManyData,
  };
}

test("queues an immediate notification.email outbox event", async () => {
  const { tx, getCreateManyData, getNotificationDeliveryCreateManyData } = createTransactionClient();

  const created = await queueNotificationEmailOutboxEvent(tx, {
    organizationId: 7,
    recipientId: 5,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Lease reminder",
    body: "Your lease renews soon.",
    idempotencyKey: "verify-email:7:abc123",
  });

  assert.equal(created.eventType, "notification.email");
  const data = getCreateManyData();
  assert.ok(data);
  assert.equal(data.eventType, "notification.email");
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.idempotencyKey, "verify-email:7:abc123");
  assert.equal(data.availableAt, undefined);
  assert.deepEqual(data.payload, {
    organizationId: 7,
    recipientId: 5,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Lease reminder",
    body: "Your lease renews soon.",
  });

  const notificationDelivery = getNotificationDeliveryCreateManyData();
  assert.ok(notificationDelivery);
  assert.deepEqual(notificationDelivery, {
    organizationId: 7,
    outboxEventId: 44,
    channel: "email",
    status: "queued",
    recipientId: 5,
    recipientType: "tenant",
    destination: "tenant@example.com",
    subject: "Lease reminder",
    idempotencyKey: "verify-email:7:abc123",
  });
});

test("queues a delayed notification.email outbox event", async () => {
  const { tx, getCreateManyData } = createTransactionClient();
  const startedAt = Date.now();

  await queueNotificationEmailOutboxEvent(tx, {
    organizationId: 7,
    recipientId: 5,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Lease reminder",
    body: "Your lease renews soon.",
    idempotencyKey: "verify-email:7:def456",
    delayMs: 5_000,
  });

  const data = getCreateManyData();
  assert.ok(data);
  assert.ok(data.availableAt instanceof Date);
  const availableAt = data.availableAt as Date;
  assert.ok(availableAt.getTime() >= startedAt + 4_900);
  assert.ok(availableAt.getTime() <= Date.now() + 5_100);
});

test("validates notification outbox payload and idempotency key", async () => {
  const { tx } = createTransactionClient();

  await assert.rejects(
    queueNotificationEmailOutboxEvent(tx, {
      organizationId: 7,
      recipientId: 5,
      recipientType: "tenant",
      email: "invalid-email",
      subject: "Lease reminder",
      body: "Your lease renews soon.",
      idempotencyKey: "verify-email:7:ghi789",
    }),
  );

  await assert.rejects(
    queueNotificationEmailOutboxEvent(tx, {
      organizationId: 7,
      recipientId: 5,
      recipientType: "tenant",
      email: "tenant@example.com",
      subject: "Lease reminder",
      body: "Your lease renews soon.",
      idempotencyKey: "",
    }),
  );
});
