import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarDate, getStartOfCalendarDate } from "./lease-dates.js";

test("organization calendar dates differ from UTC around midnight", () => {
  const instant = new Date("2026-10-02T02:00:00.000Z");
  assert.equal(getCalendarDate(instant, "America/Chicago"), "2026-10-01");
  assert.equal(getCalendarDate(instant, "Asia/Tokyo"), "2026-10-02");
});

test("local midnight follows daylight saving changes", () => {
  assert.equal(getStartOfCalendarDate("2026-03-08", "America/Chicago").toISOString(), "2026-03-08T06:00:00.000Z");
  assert.equal(getStartOfCalendarDate("2026-03-09", "America/Chicago").toISOString(), "2026-03-09T05:00:00.000Z");
  assert.equal(getStartOfCalendarDate("2026-11-01", "America/Chicago").toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(getStartOfCalendarDate("2026-11-02", "America/Chicago").toISOString(), "2026-11-02T06:00:00.000Z");
});

test("calendar dates preserve four-digit years before 1000", () => {
  const instant = new Date("0500-01-01T00:00:00.000Z");
  assert.equal(getCalendarDate(instant, "UTC"), "0500-01-01");
  assert.equal(getStartOfCalendarDate("0500-01-01", "UTC").toISOString(), instant.toISOString());
});
