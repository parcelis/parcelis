import { LeaseStatus, Prisma, type PrismaClient } from "@parcelis/db";

const reconciliationIntervalMs = 60_000;
const batchSize = 100;

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
          const lease = await tx.lease.findFirst({ where: { id: leaseId, organizationId } });
          if (!lease || lease.status !== LeaseStatus.scheduled) return false;
          if (!lease.startsOn || !lease.propertyId || !lease.unitId) {
            throw new Error(`Scheduled lease ${leaseId} is incomplete.`);
          }
          if (lease.startsOn > now) return false;

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
            if (!occupiedLease.endsOn || occupiedLease.endsOn >= lease.startsOn) {
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

export async function reconcileScheduledLeases(prisma: PrismaClient, now = new Date()) {
  let lastId = 0;
  while (true) {
    const leases = await prisma.lease.findMany({
      where: { id: { gt: lastId }, status: LeaseStatus.scheduled, startsOn: { lte: now } },
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
      }
    }
    if (leases.length < batchSize) return;
  }
}

export function startLeaseActivationReconciler(prisma: PrismaClient) {
  let stopped = false;
  let running: Promise<void> | null = null;
  const run = () => {
    if (stopped || running) return;
    running = reconcileScheduledLeases(prisma)
      .catch((error) => console.error("[parcelis] Lease activation reconciliation failed:", error))
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
  };
}
