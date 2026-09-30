import {
  markNotificationDeliveryAccepted,
  markNotificationDeliveryFailed,
  markNotificationDeliveryRetrying,
  markNotificationDeliverySending,
  markNotificationDeliverySent,
  PrismaClient,
  PrismaPg,
} from "@parcelis/db";
import { getOrganizationEmailConfig, sendEmail } from "@parcelis/email";
import { createQueueRegistry, getRedisConnectionOptions, notificationEmailJobName, queueNames } from "@parcelis/jobs";
import { Worker } from "bullmq";
import { startOutboxDispatcher } from "./outbox-dispatcher.js";
import { processNotificationEmailJob } from "./processors/notification-email.processor.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
await prisma.$connect();

const redisConnection = getRedisConnectionOptions();

// Initialize Redis connection and create queues.
const queues = Object.values(createQueueRegistry(redisConnection));
const queueByName = new Map(queues.map((queue) => [queue.name, queue]));

const notificationEmailWorker = new Worker(
  queueNames.accountNotifications,
  async (job) => {
    if (job.name !== notificationEmailJobName) {
      throw new Error(`Unsupported account notification job: ${job.name}.`);
    }

    return processNotificationEmailJob(
      job.data,
      {
        send: sendEmail,
        rememberAccepted: (data) => job.updateData(data),
        rememberAcceptedDelivery: ({ outboxEventId, messageId }) =>
          markNotificationDeliveryAccepted(prisma, { outboxEventId, providerMessageId: messageId }),
        getEmailConfig: (organizationId) => getOrganizationEmailConfig(prisma, organizationId),
        markDeliverySending: async ({ outboxEventId }) => {
          return markNotificationDeliverySending(prisma, { outboxEventId });
        },
        markDeliverySent: async ({ outboxEventId, messageId }) => {
          await markNotificationDeliverySent(prisma, { outboxEventId, providerMessageId: messageId });
        },
        markDeliveryFailed: async ({ outboxEventId, error }) => {
          await markNotificationDeliveryFailed(prisma, { outboxEventId, error });
        },
        markDeliveryRetrying: async ({ outboxEventId, error }) => {
          await markNotificationDeliveryRetrying(prisma, { outboxEventId, error });
        },
      },
      { attemptsMade: job.attemptsMade, attempts: job.opts.attempts ?? 1 },
    );
  },
  { connection: redisConnection },
);

// Wait until all queues are ready before starting the worker.
await Promise.all(queues.map((queue) => queue.waitUntilReady()));
await notificationEmailWorker.waitUntilReady();

console.info(`[parcelis] Worker connected to Redis for ${queues.length} queues.`);
const stopOutboxDispatcher = startOutboxDispatcher(prisma, queueByName);

let isShuttingDown = false;

// Graceful shutdown function for the worker.
async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`[parcelis] Worker received ${signal}; stopping outbox dispatch and closing connections.`);
  const deadline = setTimeout(() => {
    console.error("[parcelis] Worker shutdown timed out; outstanding claims will expire.");
    process.exit(1);
  }, 10_000);

  try {
    await stopOutboxDispatcher();
    await notificationEmailWorker.close();
    await Promise.allSettled(queues.map((queue) => queue.close()));
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(0);
  } catch (error) {
    console.error("[parcelis] Worker shutdown failed:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown on SIGINT and SIGTERM signals.
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
