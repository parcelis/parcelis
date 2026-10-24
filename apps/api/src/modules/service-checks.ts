import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getRedisConnectionOptions,
  healthJobName,
  emailHealthJobName,
  healthJobResultSchema,
  leaseReconciliationJobName,
  scheduledHeartbeatKey,
  scheduledRunHeartbeatSchema,
  scheduledHeartbeatTtlSeconds,
  outboxHeartbeatKey,
  queueNames,
  workerHeartbeatKey,
} from "@parcelis/jobs";
import { Queue } from "bullmq";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getObjectStorageConfig } from "./object-storage.config";
import { getPrisma } from "./prisma";
import { registerApiCleanup } from "./runtime-cleanup";
import { abortable, createProbeDeadline, withProbeDeadline } from "./probe-deadline";

export type CheckStatus = "operational" | "degraded" | "down" | "unknown";
export type ServiceCheck = {
  id: string;
  name: string;
  status: CheckStatus;
  checkedAt: string;
  latencyMs: number;
  note?: string;
  checks?: ServiceCheck[];
};
export const checkTimeoutMs = 5_000;

export async function runCheck(
  id: string,
  name: string,
  probe: (signal: AbortSignal) => Promise<CheckStatus | void>,
): Promise<ServiceCheck> {
  const start = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      Promise.resolve().then(() => probe(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Check timed out");
          controller.abort(error);
          reject(error);
        }, checkTimeoutMs);
      }),
    ]);
    return {
      id,
      name,
      status: status ?? "operational",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - start,
    };
  } catch {
    return { id, name, status: "down", checkedAt: new Date().toISOString(), latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

let queues: Queue[] | undefined;
function getQueues() {
  if (!queues) {
    const connection = {
      ...getRedisConnectionOptions(),
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 500, 2_000),
    };
    queues = [queueNames.accountNotifications, queueNames.leasingNotifications].map((name) => {
      const queue = new Queue(name, { connection });
      queue.on("error", () => {});
      return queue;
    });
    registerApiCleanup(async () => {
      await Promise.allSettled(queues?.map((queue) => queue.getBackend().close(true)) ?? []);
      queues = undefined;
    });
  }
  return queues;
}

export async function checkStorage(transfer = false, signUrl: typeof getSignedUrl = getSignedUrl) {
  const config = getObjectStorageConfig();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  try {
    if (!transfer) {
      await withProbeDeadline(checkTimeoutMs - 100, (signal) =>
        client.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal: signal }),
      );
      return;
    }
    const key = `healthchecks/${randomUUID()}.txt`;
    const body = randomUUID();
    const publicClient = new S3Client({
      endpoint: config.publicEndpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    const deadline = createProbeDeadline(3_000);
    const { signal } = deadline;
    try {
      const input = { Bucket: config.bucket, Key: key };
      const uploadUrl = await abortable(
        () => signUrl(publicClient, new PutObjectCommand(input), { expiresIn: 30 }),
        signal,
      );
      const downloadUrl = await abortable(
        () => signUrl(publicClient, new GetObjectCommand(input), { expiresIn: 30 }),
        signal,
      );
      await verifyStorageTransfer({
        upload: async () => {
          const response = await abortable(
            () => fetch(uploadUrl, { method: "PUT", body, signal, redirect: "error" }),
            signal,
          );
          if (response.body) await abortable(() => response.body!.cancel(), signal);
          if (!response.ok) throw new Error("Upload failed");
        },
        download: async () => {
          const response = await abortable(() => fetch(downloadUrl, { signal, redirect: "error" }), signal);
          if (!response.ok || (await abortable(() => response.text(), signal)) !== body)
            throw new Error("Download mismatch");
        },
        remove: async () => {
          await withProbeDeadline(1_500, (cleanupSignal) =>
            client.send(new DeleteObjectCommand(input), { abortSignal: cleanupSignal }),
          );
        },
      });
    } finally {
      deadline.dispose();
      publicClient.destroy();
    }
  } finally {
    client.destroy();
  }
}

export async function verifyStorageTransfer(probe: {
  upload: () => Promise<void>;
  download: () => Promise<void>;
  remove: () => Promise<void>;
}) {
  try {
    await probe.upload();
    await probe.download();
  } finally {
    await probe.remove();
  }
}

export function groupChecks(id: string, name: string, checks: ServiceCheck[], criticalId: string): ServiceCheck {
  const critical = checks.find((check) => check.id === criticalId)!;
  const status =
    critical.status === "down"
      ? "down"
      : checks.some((check) => check.status === "down" || check.status === "degraded")
        ? "degraded"
        : checks.some((check) => check.status === "unknown")
          ? "unknown"
          : "operational";
  return {
    id,
    name,
    status,
    checks,
    checkedAt: checks
      .map((check) => check.checkedAt)
      .sort()
      .at(-1)!,
    latencyMs: Math.max(...checks.map((check) => check.latencyMs)),
  };
}

export async function checkDependencies(deep = false) {
  return Promise.all([
    runCheck("database", "PostgreSQL", async () => {
      await getPrisma().$queryRaw`SELECT 1`;
    }),
    runCheck("redis", "Redis", async () => {
      const redis = await getQueues()[0]!.getBackend().client;
      if (!("ping" in redis) || typeof redis.ping !== "function" || (await redis.ping()) !== "PONG") {
        throw new Error("No pong");
      }
    }),
    (async () => {
      const checks = await Promise.all([
        runCheck("bucket", "Bucket access", () => checkStorage()),
        ...(deep ? [runCheck("transfers", "File upload, download, and cleanup", () => checkStorage(true))] : []),
      ]);
      return groupChecks("storage", "Object storage", checks, "bucket");
    })(),
  ]);
}

function createCanaryQueue(queueName: string, waitMs: number) {
  const queue = new Queue(queueName, {
    connection: {
      ...getRedisConnectionOptions(),
      connectTimeout: Math.min(waitMs, 1_000),
      commandTimeout: Math.min(waitMs, 1_000),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    },
  });
  queue.on("error", () => {});
  return queue;
}

export async function probeQueueJob(
  queueName: string,
  name: string,
  waitMs = 1_500,
  parentSignal?: AbortSignal,
  createQueue = createCanaryQueue,
) {
  parentSignal?.throwIfAborted();
  const queue = createQueue(queueName, waitMs);
  const deadline = createProbeDeadline(waitMs);
  const signal = parentSignal ? AbortSignal.any([deadline.signal, parentSignal]) : deadline.signal;
  const jobId = `health-${randomUUID()}`;
  try {
    const job = await abortable(
      () =>
        queue.add(
          name,
          {},
          {
            jobId,
            attempts: 1,
            removeOnComplete: { age: 60, count: 20 },
            removeOnFail: { age: 60, count: 20 },
          },
        ),
      signal,
    );
    while (true) {
      const state = await abortable(() => job.getState(), signal);
      if (state === "completed") {
        const completed = await abortable(() => queue.getJob(jobId), signal);
        return completed?.returnvalue as unknown;
      }
      if (state === "failed") throw new Error("Health job failed");
      await delay(100, undefined, { signal });
    }
  } finally {
    deadline.dispose();
    try {
      await withProbeDeadline(200, () => queue.remove(jobId)).catch(() => {});
    } finally {
      await withProbeDeadline(200, () => queue.getBackend().close(true));
    }
  }
}

export function isScheduledRunHealthy(
  scheduler: { key: string; name: string; next?: number } | undefined,
  storedHeartbeat: string | null,
  now = Date.now(),
) {
  if (!scheduler || !storedHeartbeat) return false;
  let stored: unknown;
  try {
    stored = JSON.parse(storedHeartbeat);
  } catch {
    return false;
  }
  const parsed = scheduledRunHeartbeatSchema.safeParse(stored);
  if (!parsed.success) return false;
  const heartbeat = parsed.data;
  return (
    scheduler.key === leaseReconciliationJobName &&
    scheduler.name === leaseReconciliationJobName &&
    heartbeat.schedulerId === scheduler.key &&
    heartbeat.jobId === `repeat:${scheduler.key}:${heartbeat.scheduledAt}` &&
    heartbeat.scheduledAt <= heartbeat.completedAt &&
    heartbeat.completedAt <= now &&
    now - heartbeat.scheduledAt < scheduledHeartbeatTtlSeconds * 1_000 &&
    now - heartbeat.completedAt < scheduledHeartbeatTtlSeconds * 1_000 &&
    Number.isFinite(scheduler.next) &&
    scheduler.next! > heartbeat.scheduledAt
  );
}

export async function checkBackgroundServices() {
  const processing = await runCheck("processing", "Job processing", async (parentSignal) => {
    const deadline = createProbeDeadline(checkTimeoutMs - 500);
    const signal = AbortSignal.any([parentSignal, deadline.signal]);
    try {
      for (const queue of getQueues()) {
        const redis = await abortable(() => queue.getBackend().client, signal);
        if (!(await abortable(() => redis.get(workerHeartbeatKey(queue.name)), signal)))
          throw new Error("Missing heartbeat");
        await probeQueueJob(queue.name, healthJobName, 1_500, signal);
      }
    } finally {
      deadline.dispose();
    }
  });
  const checks = await Promise.all([
    Promise.resolve(processing),
    (async () => {
      const result = await runCheck("email", "Email transport", async (signal) => {
        return healthJobResultSchema.parse(
          await probeQueueJob(queueNames.accountNotifications, emailHealthJobName, 3_000, signal),
        ).status;
      });
      return {
        ...result,
        note:
          result.status === "unknown"
            ? "Email transport is not configured on the worker."
            : "SMTP connection and authentication; message delivery is not measured.",
      };
    })(),
    runCheck("scheduled", "Scheduled jobs", async (signal) => {
      const queue = getQueues()[1]!;
      const redis = await abortable(() => queue.getBackend().client, signal);
      const [heartbeat, scheduler] = await Promise.all([
        abortable(() => redis.get(scheduledHeartbeatKey), signal),
        abortable(() => queue.getJobScheduler(leaseReconciliationJobName), signal),
      ]);
      if (!isScheduledRunHealthy(scheduler, heartbeat)) {
        throw new Error("Scheduled reconciliation has not completed recently");
      }
    }),
    runCheck("outbox", "Outbox dispatcher", async () => {
      const redis = await getQueues()[0]!.getBackend().client;
      if (!(await redis.get(outboxHeartbeatKey))) throw new Error("Missing poll heartbeat");
      const overdue = await getPrisma().outboxEvent.findFirst({
        where: {
          OR: [
            { status: "pending", availableAt: { lt: new Date(Date.now() - 300_000) } },
            { status: "processing", lockedUntil: { lt: new Date(Date.now() - 300_000) } },
            { status: "failed", failedAt: { gt: new Date(Date.now() - 3_600_000) } },
          ],
        },
        select: { id: true },
      });
      return overdue ? "degraded" : "operational";
    }),
    runCheck("queues", "Queue backlog", async () => {
      for (const queue of getQueues()) {
        const [waiting, active, failed] = await Promise.all([
          queue.getJobs(["wait"], 0, 0, true),
          queue.getJobs(["active"], 0, 0, true),
          queue.getJobs(["failed"], 0, 19),
        ]);
        if (
          [...waiting, ...active].some((job) => Date.now() - (job.processedOn ?? job.timestamp) > 300_000) ||
          failed.some((job) => (job.finishedOn ?? 0) > Date.now() - 3_600_000)
        )
          return "degraded";
      }
      return "operational";
    }),
  ]);
  return [groupChecks("workers", "BullMQ / workers", checks, "processing")];
}

export function checkHttp(id: string, name: string, url: string, expected: string) {
  return runCheck(id, name, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(checkTimeoutMs - 100), cache: "no-store" });
    if (!response.ok || !(await response.text()).includes(expected)) throw new Error("Unexpected response");
  });
}
