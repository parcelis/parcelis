import type { Lease } from "@parcelis/schemas";

export function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "Not set";
}
export function formatCurrency(cents: number | null) {
  if (cents === null) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
export function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0] ?? ""}${part.slice(1)}`.replace(/^./, (character) => character.toUpperCase()))
    .join(" ");
}
export const neutralStatusClass = "border-transparent bg-parcelis-gray/10 text-parcelis-gray";
export const leaseStatusBadges = {
  draft: {
    label: "Draft",
    className: "border-parcelis-border bg-transparent text-parcelis-gray",
    dotClassName: "bg-current",
  },
  scheduled: {
    label: "Scheduled",
    className: "border-transparent bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    dotClassName: "bg-current",
  },
  active: {
    label: "Active",
    className: "border-transparent bg-parcelis-green/15 text-parcelis-charcoal",
    dotClassName: "bg-parcelis-green",
  },
  notice: {
    label: "Notice",
    className: "border-transparent bg-amber-500/10 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    dotClassName: "bg-current",
  },
  ended: {
    label: "Ended",
    className: neutralStatusClass,
    dotClassName: "bg-current",
  },
} satisfies Record<Lease["status"], { label: string; className: string; dotClassName: string }>;
