import { createHash, randomBytes } from "node:crypto";
import type { ApiTokenExpiration } from "@parcelis/schemas";

const apiTokenPrefix = "pcls_api_";

// Generates a new API token with the standard prefix and a random 32-byte value.
export function createApiToken() {
  return `${apiTokenPrefix}${randomBytes(32).toString("base64url")}`;
}

// Hashes an API token using SHA-256 and returns the hexadecimal digest.
export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Returns the display prefix for an API token, which includes the standard prefix and the first 10 characters of the token.
export function getApiTokenDisplayPrefix(token: string) {
  return token.slice(0, apiTokenPrefix.length + 10);
}

// Utility function to add a specified number of months to a date, preserving the day of the month as much as possible.
function addUtcMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfMonth = new Date(result);
  lastDayOfMonth.setUTCMonth(lastDayOfMonth.getUTCMonth() + 1, 0);

  result.setUTCDate(Math.min(originalDay, lastDayOfMonth.getUTCDate()));

  return result;
}

// Returns the expiration date for an API token based on the specified expiration setting. If the expiration is "never", it returns null.
export function getApiTokenExpiration(expiration: ApiTokenExpiration, now: Date = new Date()): Date | null {
  switch (expiration) {
    case "never":
      return null;
    case "7_days":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "1_month":
      return addUtcMonths(now, 1);
    case "3_months":
      return addUtcMonths(now, 3);
    case "6_months":
      return addUtcMonths(now, 6);
    case "12_months":
      return addUtcMonths(now, 12);
  }
}
