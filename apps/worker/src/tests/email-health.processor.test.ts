import assert from "node:assert/strict";
import test from "node:test";
import { EmailConfigurationError } from "@parcelis/email";
import { processEmailHealthJob } from "../processors/email-health.processor.js";

test("email health probes the SMTP transport with a two-second budget", async () => {
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

test("email health uses SMTP_HOST from the environment by default", async (t) => {
  const previousHost = process.env.SMTP_HOST;
  t.after(() => {
    if (previousHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previousHost;
  });
  process.env.SMTP_HOST = "smtp.test";
  let probed = false;
  assert.deepEqual(
    await processEmailHealthJob(async () => {
      probed = true;
    }),
    { status: "operational" },
  );
  assert.equal(probed, true);

  delete process.env.SMTP_HOST;
  assert.deepEqual(await processEmailHealthJob(), { status: "unknown" });
});

test("email health reports configuration errors as unknown", async () => {
  assert.deepEqual(
    await processEmailHealthJob(async () => {
      throw new EmailConfigurationError("SMTP_PASSWORD must be configured before sending email.");
    }, "smtp.test"),
    { status: "unknown" },
  );
});

test("email health reports incomplete environment configuration as unknown", async (t) => {
  const previousHost = process.env.SMTP_HOST;
  const previousFrom = process.env.EMAIL_FROM;
  t.after(() => {
    if (previousHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previousHost;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  });
  process.env.SMTP_HOST = "smtp.test";
  delete process.env.EMAIL_FROM;
  assert.deepEqual(await processEmailHealthJob(), { status: "unknown" });
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
