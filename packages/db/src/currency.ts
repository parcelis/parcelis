import type { Prisma } from "@prisma/client";

// Use the same transaction as the monetary write so a failed save also rolls back the lock.
export async function lockOrganizationCurrency(tx: Prisma.TransactionClient, organizationId: number) {
  await tx.organization.updateMany({
    where: { id: organizationId, currencyLockedAt: null },
    data: { currencyLockedAt: new Date() },
  });

  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { currencyCode: true },
  });

  return organization.currencyCode;
}
