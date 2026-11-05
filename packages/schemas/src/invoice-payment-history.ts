export function hasInvoicePaymentHistory(
  invoice: {
    amountCents: number;
    balanceCents: number;
    paidOn: Date | string | null;
    paidByTenantId: number | null;
    paymentMethod: string | null;
  },
  paymentCount: number,
) {
  return (
    paymentCount > 0 ||
    invoice.balanceCents < invoice.amountCents ||
    invoice.paidOn !== null ||
    invoice.paidByTenantId !== null ||
    invoice.paymentMethod !== null
  );
}
