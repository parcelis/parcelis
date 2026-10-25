import assert from "node:assert/strict";
import test from "node:test";
import { processEmailHealthJob } from "../processors/email-health.processor.js";

test("email health verifies only the configured global fallback with a two-second budget", async () => {
  let timeout: number | undefined;
  assert.deepEqual(
    await processEmailHealthJob(async (value) => {
      timeout = value;
    }, "smtp.test"),
    {
      status: "operational",
    },
  );
  assert.equal(timeout, 2_000);
});

test("email health reports an unconfigured global fallback as unknown without probing", async () => {
  assert.deepEqual(
    await processEmailHealthJob(async () => {
      assert.fail("Unexpected verification");
    }, " "),
    {
      status: "unknown",
    },
  );
});

test("email health reports failed verification as down", async () => {
  assert.deepEqual(
    await processEmailHealthJob(async () => {
      throw new Error("SMTP unavailable");
    }, "smtp.test"),
    {
      status: "down",
    },
  );
});
