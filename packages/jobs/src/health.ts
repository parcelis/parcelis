import { z } from "zod";

export const healthJobName = "system.healthcheck";
export const emailHealthJobName = "system.healthcheck.email";
export const healthJobResultSchema = z.object({ status: z.enum(["operational", "down", "unknown"]) });
export const scheduledHeartbeatKey = "parcelis:health:scheduled-jobs";
export const scheduledHeartbeatTtlSeconds = 180;
export const scheduledRunHeartbeatSchema = z.object({
  schedulerId: z.string(),
  jobId: z.string(),
  scheduledAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
});

export function getScheduledRunHeartbeat(
  job: { name: string; id?: string; repeatJobKey?: string },
  schedulerId: string,
  completedAt = Date.now(),
) {
  const prefix = `repeat:${schedulerId}:`;
  const scheduledAt = Number(job.id?.slice(prefix.length));
  if (
    job.name !== schedulerId ||
    job.repeatJobKey !== schedulerId ||
    !Number.isSafeInteger(scheduledAt) ||
    scheduledAt < 0 ||
    scheduledAt > completedAt ||
    job.id !== `repeat:${schedulerId}:${scheduledAt}`
  )
    return undefined;
  return { schedulerId, jobId: job.id, scheduledAt, completedAt };
}
export const workerHeartbeatTtlSeconds = 60;
export const workerHeartbeatIntervalMs = 15_000;
export const outboxHeartbeatKey = "parcelis:health:outbox";
export const workerHeartbeatKey = (queue: string) => `parcelis:health:worker:${queue}`;
