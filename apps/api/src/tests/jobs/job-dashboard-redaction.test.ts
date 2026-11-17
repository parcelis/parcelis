import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sanitizeJobResponse } from "../../modules/job-dashboard-redaction";

const fixtureEmail = () => `fixture-${randomUUID()}@example.test`;
const fixtureSecret = () => `fixture-secret-${randomUUID()}`;

test("job dashboard responses retain operational IDs and redact personal job data", () => {
  const email = fixtureEmail();
  const body = sanitizeJobResponse({
    job: {
      data: { organizationId: 7, leaseId: 12, residentEmail: email },
      failedReason: `${email} failed to process`,
      stacktrace: [`${email} at /tmp/fixture-${randomUUID()}/path`],
      logs: [`${email} at /tmp/fixture-${randomUUID()}/path`],
      returnValue: { email },
      progress: { email },
      opts: { attempts: 3, secret: fixtureSecret() },
    },
  });

  assert.deepEqual(body, {
    job: {
      data: { organizationId: 7, leaseId: 12 },
      failedReason: "Job error details redacted",
      stacktrace: ["Stack trace redacted"],
      logs: ["Log details redacted"],
      returnValue: "[redacted]",
      progress: "[redacted]",
      opts: { attempts: 3 },
    },
  });
});
