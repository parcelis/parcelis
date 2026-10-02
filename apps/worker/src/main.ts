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
import {
  createQueueRegistry,
  getRedisConnectionOptions,
  leaseActivationJobName,
  leaseActivationJobSchema,
  leaseExpirationJobName,
  leaseExpirationJobSchema,
  leaseReconciliationJobName,
  notificationEmailJobName,
  queueNames,
} from "@parcelis/jobs";
import { Worker } from "bullmq";
import {
  activateScheduledLease,
  endExpiredLease,
  isFinalLeaseJobAttempt,
  reconcileLeaseLifecycle,
  recordLeaseLifecycleFailure,
  startLeaseReconciler,
} from "./lease-activation.js";
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
const queueRegistry = createQueueRegistry(redisConnection);
const queues = Object.values(queueRegistry);
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

const leaseActivationWorker = new Worker(
  queueNames.leasingNotifications,
  async (job) => {
    if (job.name === leaseReconciliationJobName) {
      return reconcileLeaseLifecycle(prisma);
    }
    if (job.name === leaseExpirationJobName) {
      const { organizationId, leaseId } = leaseExpirationJobSchema.parse(job.data);
      try {
        return await endExpiredLease(prisma, organizationId, leaseId);
      } catch (error) {
        if (isFinalLeaseJobAttempt(job.attemptsMade, job.opts.attempts)) {
          await recordLeaseLifecycleFailure(prisma, organizationId, leaseId, "lease.expiration_failed", error).catch(
            (recordError) =>
              console.error(`[parcelis] Could not record expiration failure for lease ${leaseId}:`, recordError),
          );
        }
        throw error;
      }
    }
    if (job.name !== leaseActivationJobName) {
      throw new Error(`Unsupported lease activation job: ${job.name}.`);
    }
    const { organizationId, leaseId } = leaseActivationJobSchema.parse(job.data);
    try {
      return await activateScheduledLease(prisma, organizationId, leaseId);
    } catch (error) {
      if (isFinalLeaseJobAttempt(job.attemptsMade, job.opts.attempts)) {
        await recordLeaseLifecycleFailure(prisma, organizationId, leaseId, "lease.activation_failed", error).catch(
          (recordError) =>
            console.error(`[parcelis] Could not record activation failure for lease ${leaseId}:`, recordError),
        );
      }
      throw error;
    }
  },
  { connection: redisConnection },
);

// Wait until all queues are ready before starting the worker.
await Promise.all(queues.map((queue) => queue.waitUntilReady()));
await notificationEmailWorker.waitUntilReady();
await leaseActivationWorker.waitUntilReady();

console.info(`[parcelis] Worker connected to Redis for ${queues.length} queues.`);
const stopOutboxDispatcher = startOutboxDispatcher(prisma, queueByName);
const stopLeaseReconciler = startLeaseReconciler(prisma, queueRegistry.leasingNotifications);

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
    await stopLeaseReconciler();
    await notificationEmailWorker.close();
    await leaseActivationWorker.close();
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
