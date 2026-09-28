import { Queue, type ConnectionOptions } from "bullmq";
import { queueNames } from "./queue-names.js";

export type QueueRegistry = { [Key in keyof typeof queueNames]: Queue };

export function createQueueRegistry(connection: ConnectionOptions): QueueRegistry {
  return Object.fromEntries(
    Object.entries(queueNames).map(([key, name]) => [key, new Queue(name, { connection })]),
  ) as QueueRegistry;
}
