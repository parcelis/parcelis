import { NotificationDeliveryChannel, NotificationDeliveryStatus, Prisma, PrismaClient } from "@prisma/client";

export type RecordNotificationDeliveryInput = {
  organizationId: number;
  outboxEventId: number;
  channel: NotificationDeliveryChannel;
  recipientId: number;
  recipientType: string;
  destination: string;
  subject: string;
  idempotencyKey: string;
};

type NotificationDeliveryClient = PrismaClient | Prisma.TransactionClient;

export async function recordNotificationDeliveryQueued(
  tx: Prisma.TransactionClient,
  input: RecordNotificationDeliveryInput,
) {
  await tx.notificationDelivery.createMany({
    data: {
      organizationId: input.organizationId,
      outboxEventId: input.outboxEventId,
      channel: input.channel,
      status: NotificationDeliveryStatus.queued,
      recipientId: input.recipientId,
      recipientType: input.recipientType,
      destination: input.destination,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
    },
    skipDuplicates: true,
  });

  return tx.notificationDelivery.findUniqueOrThrow({
    where: { outboxEventId: input.outboxEventId },
  });
}

export async function markNotificationDeliverySending(
  prisma: NotificationDeliveryClient,
  input: { outboxEventId: number; attemptedAt?: Date },
) {
  const attemptedAt = input.attemptedAt ?? new Date();

  await prisma.notificationDelivery.updateMany({
    where: { outboxEventId: input.outboxEventId, status: { not: NotificationDeliveryStatus.sent } },
    data: {
      status: NotificationDeliveryStatus.sending,
      attemptCount: { increment: 1 },
      lastAttemptAt: attemptedAt,
      failedAt: null,
      lastError: null,
    },
  });

  return prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: input.outboxEventId } });
}

export async function markNotificationDeliverySent(
  prisma: NotificationDeliveryClient,
  input: { outboxEventId: number; providerMessageId?: string | null; sentAt?: Date },
) {
  await prisma.notificationDelivery.updateMany({
    where: { outboxEventId: input.outboxEventId, status: { not: NotificationDeliveryStatus.sent } },
    data: {
      status: NotificationDeliveryStatus.sent,
      sentAt: input.sentAt ?? new Date(),
      failedAt: null,
      lastError: null,
      ...(input.providerMessageId === undefined ? {} : { providerMessageId: input.providerMessageId }),
    },
  });

  return prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: input.outboxEventId } });
}

export async function markNotificationDeliveryAccepted(
  prisma: NotificationDeliveryClient,
  input: { outboxEventId: number; providerMessageId: string },
) {
  await prisma.notificationDelivery.updateMany({
    where: { outboxEventId: input.outboxEventId, status: { not: NotificationDeliveryStatus.sent } },
    data: { providerMessageId: input.providerMessageId },
  });
}

export async function markNotificationDeliveryFailed(
  prisma: NotificationDeliveryClient,
  input: { outboxEventId: number; error: string; failedAt?: Date },
) {
  await prisma.notificationDelivery.updateMany({
    where: { outboxEventId: input.outboxEventId, status: { not: NotificationDeliveryStatus.sent } },
    data: {
      status: NotificationDeliveryStatus.failed,
      failedAt: input.failedAt ?? new Date(),
      lastError: input.error,
    },
  });

  return prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: input.outboxEventId } });
}

export async function markNotificationDeliveryRetrying(
  prisma: NotificationDeliveryClient,
  input: { outboxEventId: number; error: string },
) {
  await prisma.notificationDelivery.updateMany({
    where: { outboxEventId: input.outboxEventId, status: NotificationDeliveryStatus.sending },
    data: {
      status: NotificationDeliveryStatus.queued,
      failedAt: null,
      lastError: input.error,
    },
  });

  return prisma.notificationDelivery.findUniqueOrThrow({ where: { outboxEventId: input.outboxEventId } });
}

export { NotificationDeliveryChannel, NotificationDeliveryStatus };
