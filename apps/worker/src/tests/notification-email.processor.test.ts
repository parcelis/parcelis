import assert from "node:assert/strict";
import test from "node:test";
import { processNotificationEmailJob } from "../processors/notification-email.processor.js";

test("processNotificationEmailJob validates payload and sends plain-text body as email", async () => {
  const sent: unknown[] = [];
  const marks: string[] = [];

  const result = await processNotificationEmailJob(
    {
      organizationId: 7,
      recipientId: 12,
      recipientType: "user",
      email: "person@example.com",
      subject: "Verify your Parcelis email",
      body: "Hello\nUse this link",
      outboxEventId: 42,
    },
    {
      getEmailConfig: async () => undefined,
      send: async (message) => {
        sent.push(message);
        return { messageId: "msg-123" };
      },
      markDeliverySending: async ({ outboxEventId }) => {
        marks.push(`sending:${outboxEventId}`);
      },
      markDeliverySent: async ({ outboxEventId, messageId }) => {
        marks.push(`sent:${outboxEventId}:${messageId}`);
      },
    },
  );

  assert.deepEqual(result, { messageId: "msg-123", outboxEventId: 42 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    emailConfig: undefined,
    to: "person@example.com",
    subject: "Verify your Parcelis email",
    text: "Hello\nUse this link",
    html: '<pre style="font-family:inherit;white-space:pre-wrap;margin:0">Hello\nUse this link</pre>',
  });
  assert.deepEqual(marks, ["sending:42", "sent:42:msg-123"]);
});

test("processNotificationEmailJob marks delivery as failed when send throws", async () => {
  const marks: string[] = [];

  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello\nUse this link",
        outboxEventId: 42,
      },
      {
        getEmailConfig: async () => undefined,
        send: async () => {
          throw new Error("SMTP unavailable");
        },
        markDeliverySending: async ({ outboxEventId }) => {
          marks.push(`sending:${outboxEventId}`);
        },
        markDeliveryFailed: async ({ outboxEventId, error }) => {
          marks.push(`failed:${outboxEventId}:${error}`);
        },
      },
    ),
    /SMTP unavailable/,
  );

  assert.deepEqual(marks, ["sending:42", "failed:42:SMTP unavailable"]);
});

test("processNotificationEmailJob rejects malformed payloads", async () => {
  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "not-an-email",
        subject: "Invalid",
        body: "Body",
        outboxEventId: 42,
      },
      {
        getEmailConfig: async () => undefined,
        send: async () => {
          throw new Error("must not send");
        },
      },
    ),
  );
});

for (const configured of [true, false]) {
  test(`delivery resolves organization SMTP settings (configured: ${configured})`, async () => {
    const config = configured
      ? {
          host: "organization.smtp.example.com",
          port: 587,
          secure: false,
          requireTLS: true,
          from: "Organization <mail@example.com>",
          user: "organization-user",
          password: "organization-password",
        }
      : undefined;
    await processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Verification link",
        outboxEventId: 42,
      },
      {
        getEmailConfig: async (organizationId) => {
          assert.equal(organizationId, 7);
          return config;
        },
        send: async (message) => {
          assert.deepEqual(message.emailConfig, config);
          return { messageId: "msg-org" };
        },
      },
    );
  });
}

test("configuration errors mark delivery failed without sending through environment SMTP", async () => {
  const failures: unknown[] = [];
  let sent = false;
  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Verification link",
        outboxEventId: 42,
      },
      {
        getEmailConfig: async () => {
          throw new Error("Cannot decrypt saved credentials");
        },
        send: async () => {
          sent = true;
          return { messageId: "unexpected" };
        },
        markDeliveryFailed: async (failure) => {
          failures.push(failure);
        },
      },
    ),
    /Cannot decrypt saved credentials/,
  );
  assert.equal(sent, false);
  assert.deepEqual(failures, [{ outboxEventId: 42, error: "Cannot decrypt saved credentials" }]);
});
