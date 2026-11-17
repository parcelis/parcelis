import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const timeZone of ["America/Los_Angeles", "Pacific/Auckland"]) {
  test(`lease end dates retain their calendar date in ${timeZone}`, () => {
    const moduleUrl = new URL("./format.ts", import.meta.url).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      import { formatLeaseEndDate } from ${JSON.stringify(moduleUrl)};
      assert.equal(formatLeaseEndDate("2026-01-01T00:00:00Z", "fixed"), "Jan 1, 2026");
      assert.equal(formatLeaseEndDate(new Date("2026-12-31T00:00:00Z"), "fixed"), "Dec 31, 2026");
      assert.equal(formatLeaseEndDate(null, "month_to_month"), "Month-to-month");
      assert.equal(formatLeaseEndDate(null, "fixed"), "Not set");
    `,
      ],
      { env: { ...process.env, TZ: timeZone }, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  });
}
