export type ReceivableInvoice = {
  dueOn: Date | string;
  status: string;
  amountCents: number;
  balanceCents: number;
};

export function getBillingCalendarDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getInvoiceCalendarDate(dueOn: Date | string) {
  return (dueOn instanceof Date ? dueOn.toISOString() : dueOn).slice(0, 10);
}

export function getReceivableStatus(
  invoice: Pick<ReceivableInvoice, "dueOn" | "status" | "balanceCents">,
  today: string,
) {
  if (invoice.status === "void") return "void";
  if (invoice.balanceCents <= 0) return "paid";
  return getInvoiceCalendarDate(invoice.dueOn) < today ? "overdue" : "open";
}

export function summarizeInvoiceBalances(invoices: readonly ReceivableInvoice[], today: string) {
  return invoices.reduce(
    (totals, invoice) => {
      if (invoice.status === "void") return totals;
      const balance = Math.max(invoice.balanceCents, 0);
      const date = getInvoiceCalendarDate(invoice.dueOn);
      totals.outstandingCents += balance;
      totals.recordedPaymentCents += invoice.amountCents - invoice.balanceCents;
      if (date > today) totals.futureCents += balance;
      else if (date === today) totals.dueTodayCents += balance;
      else totals.overdueCents += balance;
      return totals;
    },
    { futureCents: 0, dueTodayCents: 0, overdueCents: 0, outstandingCents: 0, recordedPaymentCents: 0 },
  );
}
