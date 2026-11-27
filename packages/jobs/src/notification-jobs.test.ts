import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotificationJobs,
  notificationEmailJobName,
  notificationEmailReferenceJobSchema,
  getOutboxEventContract,
  outboxEventTypes,
  parseOutboxEventPayload,
  queueNames,
} from "./index.js";

test("sendEmail enqueues a validated email job with delay when provided", async () => {
  const calls: Array<{ name: string; data: unknown; opts?: unknown }> = [];
  const jobs = createNotificationJobs({
    accountNotifications: {
      add: async (name, data, opts) => {
        calls.push({ name, data, opts });
        return { id: "job-1" };
      },
    },
  });

  const input = {
    organizationId: 7,
    outboxEventCreatedAt: "2026-09-26T00:00:00.000Z",
    outboxEventId: 88,
    delayMs: 3_000,
  };
  const { delayMs: _delayMs, ...expectedJobData } = input;

  const result = await jobs.sendEmail(input);

  assert.deepEqual(result, { id: "job-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, notificationEmailJobName);
  assert.deepEqual(calls[0]?.data, notificationEmailReferenceJobSchema.parse(expectedJobData));
  assert.deepEqual(calls[0]?.opts, { delay: 3_000 });
});

test("notification email reference timestamps are normalized to UTC", () => {
  assert.deepEqual(
    notificationEmailReferenceJobSchema.parse({
      organizationId: 7,
      outboxEventId: 88,
      outboxEventCreatedAt: "2026-09-26T02:30:00.000+02:30",
    }),
    {
      organizationId: 7,
      outboxEventId: 88,
      outboxEventCreatedAt: "2026-09-26T00:00:00.000Z",
    },
  );

  assert.notDeepEqual(
    notificationEmailReferenceJobSchema.parse({
      organizationId: 7,
      outboxEventId: 88,
      outboxEventCreatedAt: "2026-09-26T00:00:00.001Z",
    }).outboxEventCreatedAt,
    "2026-09-26T00:00:00.000Z",
  );
});

test("sendEmail enqueues without delay options when no delay is provided", async () => {
  const calls: Array<{ name: string; data: unknown; opts?: unknown }> = [];
  const jobs = createNotificationJobs({
    accountNotifications: {
      add: async (name, data, opts) => {
        calls.push({ name, data, opts });
        return { id: "job-2" };
      },
    },
  });

  await jobs.sendEmail({
    organizationId: 7,
    outboxEventCreatedAt: "2026-09-26T00:00:00.000Z",
    outboxEventId: 89,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, notificationEmailJobName);
  assert.equal(calls[0]?.opts, undefined);
});

test("sendEmail validates delay and payload", async () => {
  const jobs = createNotificationJobs({
    accountNotifications: {
      add: async () => ({ id: "ignored" }),
    },
  });

  const withPrivateContent = {
    organizationId: 7,
    outboxEventCreatedAt: "2026-09-26T00:00:00.000Z",
    outboxEventId: 90,
    template: { kind: "password-reset", url: "https://example.com/reset#token=secret" },
  };
  await assert.rejects(jobs.sendEmail(withPrivateContent));

  await assert.rejects(
    jobs.sendEmail({
      organizationId: 7,
      outboxEventCreatedAt: "2026-09-26T00:00:00.000Z",
      outboxEventId: 91,
      delayMs: -1,
    }),
  );
});

test("notification.email outbox contract resolves to account notifications queue", () => {
  const contract = getOutboxEventContract(outboxEventTypes.notificationEmail, 1);

  assert.equal(contract.queueName, queueNames.accountNotifications);
  assert.equal(contract.jobName, notificationEmailJobName);
});

test("lease expiration outbox contract routes to the leasing worker", () => {
  const contract = getOutboxEventContract(outboxEventTypes.leaseExpiration, 1);
  assert.equal(contract.queueName, queueNames.leasingNotifications);
  assert.equal(contract.jobName, "lease.expire.v1");
  assert.deepEqual(contract.payloadSchema.parse({ organizationId: 7, leaseId: 9 }), {
    organizationId: 7,
    leaseId: 9,
  });
});

test("notification.email outbox payload parser validates payload shape", () => {
  const payload = {
    organizationId: 7,
    recipientId: 50,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Subject",
    body: "Body",
  };

  assert.deepEqual(parseOutboxEventPayload(outboxEventTypes.notificationEmail, 1, payload), payload);

  for (const template of [
    { kind: "account-verification", url: "https://parcelis.example/login?mode=verify#token=abc" },
    { kind: "password-reset", url: "https://parcelis.example/login?mode=reset#token=abc" },
  ]) {
    const templated = { ...payload, template };
    assert.deepEqual(parseOutboxEventPayload(outboxEventTypes.notificationEmail, 1, templated), templated);

    assert.throws(() =>
      parseOutboxEventPayload(outboxEventTypes.notificationEmail, 1, {
        ...payload,
        template: { ...template, url: "invalid-url" },
      }),
    );
  }

  assert.throws(() =>
    parseOutboxEventPayload(outboxEventTypes.notificationEmail, 1, {
      ...payload,
      organizationId: "7",
    }),
  );
});
