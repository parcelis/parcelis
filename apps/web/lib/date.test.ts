import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTimeInTimeZone } from "./date";

test("note timestamps use the organization timezone and daylight saving time", () => {
  const winter = new Date("2026-01-15T12:30:00Z");
  const summer = new Date("2026-07-15T12:30:00Z");
  assert.match(formatDateTimeInTimeZone(winter, "America/Chicago"), /6:30 AM CST/);
  assert.match(formatDateTimeInTimeZone(summer, "America/Chicago"), /7:30 AM CDT/);
  assert.match(formatDateTimeInTimeZone(winter, "UTC"), /12:30 PM UTC/);
  assert.match(formatDateTimeInTimeZone("2026-01-01T00:30:00Z", "America/Los_Angeles"), /Dec 31, 2025/);
});
