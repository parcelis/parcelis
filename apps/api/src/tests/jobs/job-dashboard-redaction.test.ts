import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeJobResponse } from "../../modules/job-dashboard-redaction";

test("job dashboard responses retain operational IDs and redact personal job data", () => {
  const body = sanitizeJobResponse({
    job: {
      data: { organizationId: 7, leaseId: 12, residentEmail: "resident@example.test" },
      failedReason: "resident@example.test failed to process",
      stacktrace: ["resident@example.test at /private/path"],
      logs: ["resident@example.test at /private/path"],
      returnValue: { email: "resident@example.test" },
      progress: { email: "resident@example.test" },
      opts: { attempts: 3, secret: "private" },
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
