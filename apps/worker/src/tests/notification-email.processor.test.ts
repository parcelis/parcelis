import assert from "node:assert/strict";
import test from "node:test";
import { processNotificationEmailJob } from "../processors/notification-email.processor.js";

test("processNotificationEmailJob validates payload and sends plain-text body as email", async () => {
  const sent: unknown[] = [];

  const result = await processNotificationEmailJob({
    organizationId: 7,
    recipientId: 12,
    recipientType: "user",
    email: "person@example.com",
    subject: "Verify your Parcelis email",
    body: "Hello\nUse this link",
    outboxEventId: 42,
  }, {
    send: async (message) => {
      sent.push(message);
      return { messageId: "msg-123" };
    },
  });

  assert.deepEqual(result, { messageId: "msg-123", outboxEventId: 42 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    to: "person@example.com",
    subject: "Verify your Parcelis email",
    text: "Hello\nUse this link",
    html: '<pre style="font-family:inherit;white-space:pre-wrap;margin:0">Hello\nUse this link</pre>',
  });
});

test("processNotificationEmailJob rejects malformed payloads", async () => {
  await assert.rejects(
    processNotificationEmailJob({
      organizationId: 7,
      recipientId: 12,
      recipientType: "user",
      email: "not-an-email",
      subject: "Invalid",
      body: "Body",
      outboxEventId: 42,
    }),
  );
});
