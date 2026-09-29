import { z } from "zod";

// Name of the notification email job.
export const notificationEmailJobName = "notification.email.v1";

// Schema for the recipient type and notification delay.
const recipientTypeSchema = z.string().min(1).max(100);
const notificationDelayMsSchema = z.number().int().nonnegative().optional();

// Schema for the notification email job.
export const notificationEmailJobSchema = z
  .object({
    organizationId: z.number().int().positive(),
    recipientId: z.number().int().positive(),
    recipientType: recipientTypeSchema,
    email: z.email(),
    subject: z.string().min(1).max(300),
    body: z.string().min(1).max(50_000),
  })
  .strict();

// Schema for the notification email job when dispatched from the outbox.
export const notificationEmailOutboxJobSchema = notificationEmailJobSchema
  .extend({ outboxEventId: z.number().int().positive() })
  .strict();

export const notificationEmailDeliveryJobSchema = notificationEmailOutboxJobSchema
  .extend({ acceptedMessageId: z.string().min(1).optional() })
  .strict();

// Type for the notification email job.
export type NotificationEmailJob = z.infer<typeof notificationEmailJobSchema>;

// Type for the notification email job dispatched from the outbox.
export type NotificationEmailOutboxJob = z.infer<typeof notificationEmailOutboxJobSchema>;

// Type for the input to the notification email job.
export type NotificationEmailJobInput = NotificationEmailJob & {
  delayMs?: number;
};

// Type for the input to the notification email job dispatched from the outbox.
export type NotificationEmailOutboxJobInput = NotificationEmailOutboxJob & {
  delayMs?: number;
};

// Type for the notification queue.
// Type for the collection of notification queues.
export type NotificationQueue = {
  add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
};

// Factory function for creating notification job handlers.
export type NotificationQueues = {
  accountNotifications: NotificationQueue;
};

// Creates an object with methods for enqueuing notification jobs.
export function createNotificationJobs(queues: NotificationQueues) {
  return {
    async sendEmail(input: NotificationEmailOutboxJobInput) {
      const { delayMs, ...jobData } = input;
      const parsed = notificationEmailOutboxJobSchema.parse(jobData);
      const normalizedDelayMs = notificationDelayMsSchema.parse(delayMs);
      const opts = typeof normalizedDelayMs === "number" ? { delay: normalizedDelayMs } : undefined;

      return queues.accountNotifications.add(notificationEmailJobName, parsed, opts);
    },
  };
}
