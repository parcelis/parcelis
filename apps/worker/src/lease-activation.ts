import { ActivitySubjectType, LeaseStatus, Prisma, type PrismaClient } from "@parcelis/db";
import { getCalendarDate, leaseReconciliationJobName } from "@parcelis/jobs";
import type { Queue } from "bullmq";

const reconciliationIntervalMs = 5 * 60_000;
const scheduledReconciliationIntervalMs = 60_000;
const batchSize = 100;

function leaseDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

type FailureAction = "lease.activation_failed" | "lease.expiration_failed";

export function isFinalLeaseJobAttempt(attemptsMade: number, attempts = 1) {
  return attemptsMade + 1 >= attempts;
}

function failureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("occupies its unit")) return "Another active lease still occupies this unit.";
  if (message.includes("incomplete")) return "The lease is missing required details.";
  if (message.includes("occupancy") || message.includes("Property for scheduled lease")) {
    return "The unit occupancy count needs review.";
  }
  return "The lease transition failed. Retry or contact support.";
}

export async function recordLeaseLifecycleFailure(
  prisma: PrismaClient,
  organizationId: number,
  leaseId: number,
  action: FailureAction,
  error: unknown,
) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, organizationId },
    select: { propertyId: true },
  });
  if (!lease) return;
  const message = failureMessage(error);
  const recent = await prisma.activityEvent.findFirst({
    where: {
      organizationId,
      subjectType: ActivitySubjectType.lease,
      subjectId: leaseId,
      action,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { metadata: true },
    orderBy: { createdAt: "desc" },
  });
  if (
    recent?.metadata &&
    typeof recent.metadata === "object" &&
    !Array.isArray(recent.metadata) &&
    "message" in recent.metadata &&
    recent.metadata.message === message
  ) {
    return;
  }
  await prisma.activityEvent.create({
    data: {
      organizationId,
      subjectType: ActivitySubjectType.lease,
      subjectId: leaseId,
      subjectLabel: `Lease #${leaseId}`,
      propertyId: lease.propertyId,
      action,
      metadata: { message },
    },
  });
}

export async function endExpiredLease(prisma: PrismaClient, organizationId: number, leaseId: number, now = new Date()) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const lease = await tx.lease.findFirst({
            where: { id: leaseId, organizationId },
            include: { organization: { select: { timeZone: true } } },
          });
          if (
            !lease ||
            (lease.status !== LeaseStatus.active && lease.status !== LeaseStatus.notice) ||
            lease.termType !== "fixed" ||
            lease.continueMonthToMonthAfterEnd ||
            !lease.endsOn ||
            leaseDate(lease.endsOn) >= getCalendarDate(now, lease.organization.timeZone)
          ) {
            return false;
          }
          const ended = await tx.lease.updateMany({
            where: { id: leaseId, organizationId, status: lease.status },
            data: { status: LeaseStatus.ended },
          });
          if (ended.count !== 1) return false;
          if (!lease.propertyId) throw new Error(`Lease ${leaseId} has no property.`);
          const released = await tx.property.updateMany({
            where: { id: lease.propertyId, organizationId, occupiedUnits: { gt: 0 } },
            data: { occupiedUnits: { decrement: 1 } },
          });
          if (released.count !== 1) throw new Error(`Lease ${leaseId} occupancy is inconsistent.`);
          await tx.activityEvent.create({
            data: {
              organizationId,
              subjectType: ActivitySubjectType.lease,
              subjectId: leaseId,
              subjectLabel: `Lease #${leaseId}`,
              propertyId: lease.propertyId,
              action: "lease.expired",
              metadata: { previousStatus: lease.status, nextStatus: LeaseStatus.ended },
            },
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  return false;
}

export async function activateScheduledLease(
  prisma: PrismaClient,
  organizationId: number,
  leaseId: number,
  now = new Date(),
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const lease = await tx.lease.findFirst({
            where: { id: leaseId, organizationId },
            include: { organization: { select: { timeZone: true } } },
          });
          if (!lease || lease.status !== LeaseStatus.scheduled) return false;
          if (!lease.startsOn || !lease.propertyId || !lease.unitId) {
            throw new Error(`Scheduled lease ${leaseId} is incomplete.`);
          }
          const today = getCalendarDate(now, lease.organization.timeZone);
          if (leaseDate(lease.startsOn) > today) return false;

          const occupiedLease = await tx.lease.findFirst({
            where: {
              organizationId,
              unitId: lease.unitId,
              id: { not: leaseId },
              status: { in: [LeaseStatus.active, LeaseStatus.notice] },
            },
            select: { id: true, status: true, endsOn: true, propertyId: true },
          });
          if (occupiedLease) {
            if (!occupiedLease.endsOn || leaseDate(occupiedLease.endsOn) >= today) {
              throw new Error(
                `Scheduled lease ${leaseId} cannot activate while lease ${occupiedLease.id} occupies its unit.`,
              );
            }
            if (!occupiedLease.propertyId) throw new Error(`Occupied lease ${occupiedLease.id} has no property.`);
            const ended = await tx.lease.updateMany({
              where: { id: occupiedLease.id, organizationId, status: occupiedLease.status },
              data: { status: LeaseStatus.ended },
            });
            if (ended.count !== 1) throw new Error(`Occupied lease ${occupiedLease.id} changed during activation.`);
            const released = await tx.property.updateMany({
              where: { id: occupiedLease.propertyId, organizationId, occupiedUnits: { gt: 0 } },
              data: { occupiedUnits: { decrement: 1 } },
            });
            if (released.count !== 1) throw new Error(`Occupied lease ${occupiedLease.id} has inconsistent occupancy.`);
            await tx.activityEvent.create({
              data: {
                organizationId,
                subjectType: ActivitySubjectType.lease,
                subjectId: occupiedLease.id,
                subjectLabel: `Lease #${occupiedLease.id}`,
                propertyId: occupiedLease.propertyId,
                action: "lease.expired",
                metadata: { previousStatus: occupiedLease.status, nextStatus: LeaseStatus.ended },
              },
            });
          }

          const updated = await tx.lease.updateMany({
            where: { id: leaseId, organizationId, status: LeaseStatus.scheduled },
            data: { status: LeaseStatus.active },
          });
          if (updated.count !== 1) return false;
          const property = await tx.property.updateMany({
            where: { id: lease.propertyId, organizationId },
            data: { occupiedUnits: { increment: 1 } },
          });
          if (property.count !== 1) throw new Error(`Property for scheduled lease ${leaseId} was not found.`);
          await tx.activityEvent.create({
            data: {
              organizationId,
              subjectType: ActivitySubjectType.lease,
              subjectId: leaseId,
              subjectLabel: `Lease #${leaseId}`,
              propertyId: lease.propertyId,
              action: "lease.activated",
              metadata: { previousStatus: LeaseStatus.scheduled, nextStatus: LeaseStatus.active },
            },
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  return false;
}

export async function reconcileLeaseLifecycle(prisma: PrismaClient, now = new Date()) {
  const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  let lastEndedId = 0;
  while (true) {
    const leases = await prisma.lease.findMany({
      where: {
        id: { gt: lastEndedId },
        status: { in: [LeaseStatus.active, LeaseStatus.notice] },
        termType: "fixed",
        continueMonthToMonthAfterEnd: false,
        endsOn: { lt: horizon },
      },
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    for (const lease of leases) {
      lastEndedId = lease.id;
      try {
        await endExpiredLease(prisma, lease.organizationId, lease.id, now);
      } catch (error) {
        console.error(`[parcelis] Could not end expired lease ${lease.id}:`, error);
        await recordLeaseLifecycleFailure(
          prisma,
          lease.organizationId,
          lease.id,
          "lease.expiration_failed",
          error,
        ).catch((recordError) =>
          console.error(`[parcelis] Could not record expiration failure for lease ${lease.id}:`, recordError),
        );
      }
    }
    if (leases.length < batchSize) break;
  }

  let lastId = 0;
  while (true) {
    const leases = await prisma.lease.findMany({
      where: { id: { gt: lastId }, status: LeaseStatus.scheduled, startsOn: { lt: horizon } },
      select: { id: true, organizationId: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    for (const lease of leases) {
      lastId = lease.id;
      try {
        await activateScheduledLease(prisma, lease.organizationId, lease.id, now);
      } catch (error) {
        console.error(`[parcelis] Could not activate scheduled lease ${lease.id}:`, error);
        await recordLeaseLifecycleFailure(
          prisma,
          lease.organizationId,
          lease.id,
          "lease.activation_failed",
          error,
        ).catch((recordError) =>
          console.error(`[parcelis] Could not record activation failure for lease ${lease.id}:`, recordError),
        );
      }
    }
    if (leases.length < batchSize) return;
  }
}

export function startLeaseReconciler(prisma: PrismaClient, queue: Queue) {
  let stopped = false;
  let running: Promise<void> | null = null;
  let refreshing: Promise<unknown> | null = null;
  const run = () => {
    if (stopped || running) return;
    if (!refreshing) {
      refreshing = queue
        .upsertJobScheduler(
          leaseReconciliationJobName,
          { every: scheduledReconciliationIntervalMs },
          {
            name: leaseReconciliationJobName,
            data: {},
          },
        )
        .catch((error) => console.error("[parcelis] Could not schedule lease reconciliation:", error))
        .finally(() => {
          refreshing = null;
        });
    }
    running = reconcileLeaseLifecycle(prisma)
      .catch((error) => console.error("[parcelis] Lease lifecycle reconciliation failed:", error))
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(run, reconciliationIntervalMs);
  run();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
    await refreshing;
  };
}
