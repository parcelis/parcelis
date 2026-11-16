import { lockOrganizationCurrency, type Prisma } from "@parcelis/db";
import { TRPCError } from "@trpc/server";

export async function lockLeaseCurrency(
  tx: Prisma.TransactionClient,
  organizationId: number,
  existingCurrencyCode: string | null,
) {
  const currencyCode = await lockOrganizationCurrency(tx, organizationId);
  if (existingCurrencyCode !== null && existingCurrencyCode !== currencyCode) {
    throw new TRPCError({ code: "CONFLICT", message: "Lease currency does not match the organization's currency." });
  }
  return currencyCode;
}
