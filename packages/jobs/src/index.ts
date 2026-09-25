import type { ConnectionOptions } from "bullmq";

// Queue names used throughout the application.
export const queueNames = {
  accountNotifications: "account-notifications",
  leasingNotifications: "leasing-notifications",
  billingNotifications: "billing-notifications",
  outboxDispatch: "outbox-dispatch",
} as const;

// Retrieves Redis connection options based on environment variables.
export function getRedisConnectionOptions(environment: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const redisUrl = environment.REDIS_URL;

  if (redisUrl) {
    const url = new URL(redisUrl);

    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new Error("REDIS_URL must use the redis or rediss protocol.");
    }

    if (!url.password) {
      throw new Error("REDIS_URL must include a password.");
    }

    const port = Number(url.port || 6379);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("REDIS_URL port must be an integer between 1 and 65535.");
    }

    return {
      host: url.hostname.replace(/^\[(.*)\]$/, "$1"),
      port,
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }

  const host = environment.REDIS_HOST;
  const password = environment.REDIS_PASSWORD;
  const port = Number(environment.REDIS_PORT ?? 6379);

  if (!host) {
    throw new Error("REDIS_HOST is required when REDIS_URL is not set.");
  }

  if (!password) {
    throw new Error("REDIS_PASSWORD is required when REDIS_URL is not set.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REDIS_PORT must be an integer between 1 and 65535.");
  }

  return { host, port, password };
}
