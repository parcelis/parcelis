import { Queue } from "bullmq";
import { PrismaClient, PrismaPg } from "@parcelis/db";
import { getRedisConnectionOptions, queueNames } from "@parcelis/jobs";
import { startOutboxDispatcher } from "./outbox-dispatcher.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
await prisma.$connect();

// Initialize Redis connection and create queues.
const connection = getRedisConnectionOptions();
const queues = Object.values(queueNames).map((name) => new Queue(name, { connection }));
const queueByName = new Map(queues.map((queue) => [queue.name, queue]));

// Wait until all queues are ready before starting the worker.
await Promise.all(queues.map((queue) => queue.waitUntilReady()));

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
