export function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatLeaseEndDate(
  value: Date | string | null | undefined,
  termType: "fixed" | "month_to_month" | null | undefined,
) {
  if (value) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(value),
    );
  }

  return termType === "month_to_month" ? "Month-to-month" : "Not set";
}
