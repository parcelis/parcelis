import { Queue } from "bullmq";
import { getRedisConnectionOptions, queueNames } from "@parcelis/jobs";

// Initialize Redis connection and create queues.
const connection = getRedisConnectionOptions();
const queues = Object.values(queueNames).map(
  (name) => new Queue(name, { connection }),
);

// Wait until all queues are ready before starting the worker.
await Promise.all(queues.map((queue) => queue.waitUntilReady()));

console.info(`[parcelis] Worker connected to Redis for ${queues.length} queues.`);

let isShuttingDown = false;

// Graceful shutdown function for the worker.
async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`[parcelis] Worker received ${signal}; closing queue connections.`);
  await Promise.allSettled(queues.map((queue) => queue.close()));
  process.exit(0);
}

// Handle graceful shutdown on SIGINT and SIGTERM signals.
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
