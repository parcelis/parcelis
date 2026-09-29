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
      rememberAccepted: async () => {},
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
        rememberAccepted: async () => {},
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
        rememberAccepted: async () => {},
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
        rememberAccepted: async () => {},
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
        rememberAccepted: async () => {},
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

test("a stale job skips SMTP when the delivery is already sent", async () => {
  const result = await processNotificationEmailJob(
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
      markDeliverySending: async () => ({ status: "sent" }),
      rememberAccepted: async () => {},
      getEmailConfig: async () => assert.fail("Completed delivery must not load SMTP settings"),
      send: async () => assert.fail("Completed delivery must not send another email"),
      markDeliverySent: async () => assert.fail("Completed delivery must not be updated"),
    },
  );

  assert.deepEqual(result, { outboxEventId: 42, skipped: true });
});

test("a failed post-send database write recovers without sending twice", async () => {
  const original = {
    organizationId: 7,
    recipientId: 12,
    recipientType: "user",
    email: "person@example.com",
    subject: "Verify your Parcelis email",
    body: "Verification link",
    outboxEventId: 42,
  };
  let jobData: typeof original & { acceptedMessageId?: string } = original;
  let sends = 0;
  let writes = 0;
  const dependencies = {
    getEmailConfig: async () => undefined,
    send: async () => {
      sends++;
      return { messageId: "smtp-accepted-123" };
    },
    rememberAccepted: async (data: typeof original & { acceptedMessageId: string }) => {
      jobData = data;
    },
    markDeliverySent: async ({ messageId }: { messageId: string; outboxEventId: number }) => {
      assert.equal(messageId, "smtp-accepted-123");
      writes++;
      if (writes === 1) throw new Error("database temporarily unavailable");
    },
  };

  await assert.rejects(processNotificationEmailJob(jobData, dependencies), /database temporarily unavailable/);
  assert.equal(jobData.acceptedMessageId, "smtp-accepted-123");
  assert.deepEqual(await processNotificationEmailJob(jobData, dependencies), {
    messageId: "smtp-accepted-123",
    outboxEventId: 42,
  });
  assert.equal(sends, 1);
  assert.equal(writes, 2);
});

test("a checkpoint failure still records an accepted email when the database is available", async () => {
  const result = await processNotificationEmailJob(
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
      getEmailConfig: async () => undefined,
      send: async () => ({ messageId: "smtp-accepted-123" }),
      rememberAccepted: async () => {
        throw new Error("Redis temporarily unavailable");
      },
      markDeliverySent: async ({ messageId }) => {
        assert.equal(messageId, "smtp-accepted-123");
      },
    },
  );

  assert.deepEqual(result, { messageId: "smtp-accepted-123", outboxEventId: 42 });
});
