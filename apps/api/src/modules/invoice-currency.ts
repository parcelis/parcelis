import type { Prisma } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import { lockLeaseCurrency } from "../leases/lease-currency";

export async function lockInvoiceCurrency(
  tx: Prisma.TransactionClient,
  organizationId: number,
  invoice: { currencyCode: string; lease: { currencyCode: string | null } },
) {
  if (invoice.lease.currencyCode === null || invoice.currencyCode !== invoice.lease.currencyCode) {
    throw new TRPCError({ code: "CONFLICT", message: "Invoice currency does not match the lease's currency." });
  }
  await lockLeaseCurrency(tx, organizationId, invoice.currencyCode);
}
