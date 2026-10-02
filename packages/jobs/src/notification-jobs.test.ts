import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotificationJobs,
  notificationEmailJobName,
  notificationEmailOutboxJobSchema,
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
    recipientId: 21,
    recipientType: "tenant",
    email: "tenant@example.com",
    subject: "Rent reminder",
    body: "Rent is due tomorrow",
    outboxEventId: 88,
    delayMs: 3_000,
  };
  const { delayMs: _delayMs, ...expectedJobData } = input;

  const result = await jobs.sendEmail(input);

  assert.deepEqual(result, { id: "job-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, notificationEmailJobName);
  assert.deepEqual(calls[0]?.data, notificationEmailOutboxJobSchema.parse(expectedJobData));
  assert.deepEqual(calls[0]?.opts, { delay: 3_000 });
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
    recipientId: 22,
    recipientType: "tenant",
    email: "tenant2@example.com",
    subject: "Lease notice",
    body: "Your lease has been updated",
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

  await assert.rejects(
    jobs.sendEmail({
      organizationId: 7,
      recipientId: 23,
      recipientType: "tenant",
      email: "not-an-email",
      subject: "Hello",
      body: "Body",
      outboxEventId: 90,
    }),
  );

  await assert.rejects(
    jobs.sendEmail({
      organizationId: 7,
      recipientId: 23,
      recipientType: "tenant",
      email: "tenant3@example.com",
      subject: "Hello",
      body: "Body",
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
