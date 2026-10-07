export function formatInvoiceChargeDescription(description: string | null, date: string | Date) {
  if (!description) return null;

  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return description;
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(value);
  const year = String(value.getUTCFullYear());
  return description.replaceAll("{month}", month).replaceAll("{year}", year);
}
