import type { Prisma } from "@parcelis/db";
import { recordOutboxEvent } from "@parcelis/db";
import {
  getOutboxEventContract,
  notificationEmailJobSchema,
  outboxEventTypes,
  type NotificationEmailJob,
} from "@parcelis/jobs";
import { z } from "zod";

const notificationEmailOutboxRequestSchema = notificationEmailJobSchema
  .extend({
    idempotencyKey: z.string().min(1).max(191),
    delayMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type QueueNotificationEmailInput = NotificationEmailJob & {
  idempotencyKey: string;
  delayMs?: number;
};

export async function queueNotificationEmailOutboxEvent(
  tx: Prisma.TransactionClient,
  input: QueueNotificationEmailInput,
) {
  const parsed = notificationEmailOutboxRequestSchema.parse(input);
  const { idempotencyKey, delayMs, ...payload } = parsed;
  const contract = getOutboxEventContract(outboxEventTypes.notificationEmail, 1);

  return recordOutboxEvent(tx, {
    organizationId: payload.organizationId,
    eventType: outboxEventTypes.notificationEmail,
    schemaVersion: contract.schemaVersion,
    payload,
    idempotencyKey,
    ...(typeof delayMs === "number" ? { availableAt: new Date(Date.now() + delayMs) } : {}),
  });
}
