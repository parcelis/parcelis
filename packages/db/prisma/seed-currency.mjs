import { lockOrganizationCurrency } from "../src/currency.ts";

export function withSeedCurrency(prisma, organizationId, write) {
  return prisma.$transaction(async (tx) => {
    const currencyCode = await lockOrganizationCurrency(tx, organizationId);
    if (currencyCode !== "USD") throw new Error("USD demo data cannot be seeded into a non-USD organization.");
    return write(tx, currencyCode);
  });
}
