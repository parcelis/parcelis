import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const installationRecordId = "installation";

export async function initializeInstallationIdentity(prisma: Pick<PrismaClient, "installation">) {
  const existing = await prisma.installation.findUnique({ where: { id: installationRecordId } });
  if (existing) return existing;

  return prisma.installation.upsert({
    where: { id: installationRecordId },
    create: { id: installationRecordId, installationId: randomUUID() },
    update: { id: installationRecordId },
  });
}
