import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { EmailConfigurationError, getOrganizationEmailConfig, renderVerificationEmail } from "@parcelis/email";
import { UnrecoverableError } from "bullmq";
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

for (const template of [
  { kind: "account-verification", url: "https://parcelis.example/login?mode=verify#token=verify-token" },
  { kind: "password-reset", url: "https://parcelis.example/login?mode=reset#token=reset-token" },
] as const) {
  test(`processNotificationEmailJob renders the ${template.kind} template`, async () => {
    let sent: { html: string; text: string } | undefined;

    await processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject:
          template.kind === "account-verification" ? "Verify your Parcelis email" : "Reset your Parcelis password",
        body: "Legacy fallback body",
        template,
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async (message) => {
          sent = message;
          return { messageId: "msg-123" };
        },
      },
    );

    assert.ok(sent);
    assert.match(sent.html, new RegExp(template.kind === "account-verification" ? "Verify email" : "Reset password"));
    assert.ok(sent.html.includes(template.url));
    assert.match(sent.text, /parcelis\.example\/login/);
    assert.ok(!sent.html.includes("Legacy fallback body"));
  });
}

test("React Email escapes ampersands in an action URL", async () => {
  const url = "https://parcelis.example/login?mode=verify&campaign=example#token=verify-token";
  const { html } = await renderVerificationEmail(url);

  assert.ok(html.includes(url.replaceAll("&", "&amp;")));
  assert.ok(!html.includes(url));
});

test("processNotificationEmailJob keeps a temporary failure queued for BullMQ retry", async () => {
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
        markDeliveryRetrying: async ({ outboxEventId, error }) => {
          marks.push(`retrying:${outboxEventId}:${error}`);
        },
      },
    ),
    (error: unknown) =>
      error instanceof Error && !(error instanceof UnrecoverableError) && /SMTP unavailable/.test(error.message),
  );

  assert.deepEqual(marks, ["sending:42", "retrying:42:SMTP unavailable"]);
});

test("permanent SMTP errors fail immediately without consuming remaining attempts", async () => {
  const marks: string[] = [];
  const error = Object.assign(new Error("Authentication failed"), { code: "EAUTH", responseCode: 535 });

  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello",
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async () => {
          throw error;
        },
        markDeliveryFailed: async ({ outboxEventId, error: message }) => {
          marks.push(`failed:${outboxEventId}:${message}`);
        },
        markDeliveryRetrying: async () => assert.fail("Permanent errors must not be retried"),
      },
      { attemptsMade: 0, attempts: 3 },
    ),
    (error: unknown) => error instanceof UnrecoverableError && /Authentication failed/.test(error.message),
  );

  assert.deepEqual(marks, ["failed:42:Authentication failed"]);
});

test("SMTP authentication errors without a response code stop retries", async () => {
  const marks: string[] = [];
  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello",
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async () => {
          throw Object.assign(new Error("Authentication failed"), { code: "EAUTH" });
        },
        markDeliveryFailed: async () => {
          marks.push("failed");
        },
        markDeliveryRetrying: async () => {
          marks.push("retrying");
        },
      },
    ),
    (error: unknown) => error instanceof UnrecoverableError && error.message === "Authentication failed",
  );
  assert.deepEqual(marks, ["failed"]);
});

test("SMTP 421 errors remain retryable", async () => {
  const marks: string[] = [];
  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello",
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async () => {
          throw Object.assign(new Error("SMTP temporarily unavailable"), { responseCode: 421 });
        },
        markDeliveryFailed: async () => {
          marks.push("failed");
        },
        markDeliveryRetrying: async () => {
          marks.push("retrying");
        },
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof UnrecoverableError) &&
      error.message === "SMTP temporarily unavailable",
  );
  assert.deepEqual(marks, ["retrying"]);
});

test("invalid saved email settings stop retries", async () => {
  const marks: string[] = [];
  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello",
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => {
          throw new EmailConfigurationError("Invalid saved email settings");
        },
        send: async () => assert.fail("Invalid settings must not send email"),
        markDeliveryFailed: async () => {
          marks.push("failed");
        },
        markDeliveryRetrying: async () => {
          marks.push("retrying");
        },
      },
    ),
    (error: unknown) => error instanceof UnrecoverableError && error.message === "Invalid saved email settings",
  );
  assert.deepEqual(marks, ["failed"]);
});

test("temporary SMTP errors become failed after the final configured attempt", async () => {
  const marks: string[] = [];

  await assert.rejects(
    processNotificationEmailJob(
      {
        organizationId: 7,
        recipientId: 12,
        recipientType: "user",
        email: "person@example.com",
        subject: "Verify your Parcelis email",
        body: "Hello",
        outboxEventId: 42,
      },
      {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async () => {
          throw new Error("SMTP unavailable");
        },
        markDeliveryFailed: async ({ outboxEventId, error }) => {
          marks.push(`failed:${outboxEventId}:${error}`);
        },
        markDeliveryRetrying: async () => assert.fail("Final attempt must not be queued again"),
      },
      { attemptsMade: 2, attempts: 3 },
    ),
    (error: unknown) =>
      error instanceof Error && !(error instanceof UnrecoverableError) && /SMTP unavailable/.test(error.message),
  );

  assert.deepEqual(marks, ["failed:42:SMTP unavailable"]);
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

test("database configuration lookup errors are retryable without sending through environment SMTP", async () => {
  const retrying: unknown[] = [];
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
          throw new Error("Database temporarily unavailable");
        },
        send: async () => {
          sent = true;
          return { messageId: "unexpected" };
        },
        markDeliveryRetrying: async (failure) => {
          retrying.push(failure);
        },
      },
    ),
    /Database temporarily unavailable/,
  );
  assert.equal(sent, false);
  assert.deepEqual(retrying, [{ outboxEventId: 42, error: "Database temporarily unavailable" }]);
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

test("a database acceptance checkpoint survives a missing Redis job", async () => {
  const payload = {
    organizationId: 7,
    recipientId: 12,
    recipientType: "user",
    email: "person@example.com",
    subject: "Verify your Parcelis email",
    body: "Verification link",
    outboxEventId: 42,
  };
  let providerMessageId: string | null = null;
  let sends = 0;
  let sentWrites = 0;
  const dependencies = {
    getEmailConfig: async () => undefined,
    send: async () => {
      sends++;
      return { messageId: "smtp-accepted-123" };
    },
    rememberAccepted: async () => {
      throw new Error("Redis unavailable");
    },
    rememberAcceptedDelivery: async ({ messageId }: { messageId: string; outboxEventId: number }) => {
      providerMessageId = messageId;
    },
    markDeliverySending: async () => ({ status: "sending", providerMessageId }),
    markDeliverySent: async () => {
      sentWrites++;
      if (sentWrites === 1) throw new Error("database temporarily unavailable");
    },
  };

  await assert.rejects(processNotificationEmailJob(payload, dependencies), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(
      error.errors.map((cause: Error) => cause.message),
      ["Redis unavailable", "database temporarily unavailable"],
    );
    return true;
  });
  assert.equal(providerMessageId, "smtp-accepted-123");
  assert.deepEqual(await processNotificationEmailJob(payload, dependencies), {
    messageId: "smtp-accepted-123",
    outboxEventId: 42,
  });
  assert.equal(sends, 1);
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

for (const code of ["EAUTH", "ENOAUTH", "EENVELOPE"]) {
  test(`code-only ${code} errors fail without retrying`, async () => {
    const error = Object.assign(new Error("Permanent SMTP failure"), { code });
    let failed = false;
    await assert.rejects(
      processNotificationEmailJob(classificationPayload, {
        rememberAccepted: async () => {},
        getEmailConfig: async () => undefined,
        send: async () => {
          throw error;
        },
        markDeliveryFailed: async () => {
          failed = true;
        },
        markDeliveryRetrying: async () => assert.fail("Permanent errors must not be retried"),
      }),
      UnrecoverableError,
    );
    assert.equal(failed, true);
  });
}

test("SMTP 421 remains retryable even with a permanent error code", async () => {
  const error = Object.assign(new Error("SMTP temporarily unavailable"), { code: "EAUTH", responseCode: 421 });
  let retrying = false;
  await assert.rejects(
    processNotificationEmailJob(classificationPayload, {
      rememberAccepted: async () => {},
      getEmailConfig: async () => undefined,
      send: async () => {
        throw error;
      },
      markDeliveryRetrying: async () => {
        retrying = true;
      },
      markDeliveryFailed: async () => assert.fail("SMTP 421 must be retried"),
    }),
    (actual: unknown) => actual === error,
  );
  assert.equal(retrying, true);
});

for (const [label, overrides] of [
  ["invalid security", { securityType: "invalid" }],
  ["missing credentials", { username: null }],
  ["unreadable credentials", { passwordCipher: "invalid-ciphertext" }],
] as const) {
  test(`saved SMTP ${label} fails immediately without sending`, async () => {
    const prisma = {
      organizationEmailSettings: {
        findUnique: async () => ({
          host: "smtp.example.com",
          port: 587,
          securityType: "starttls",
          fromEmail: "notices@example.com",
          fromName: null,
          requireSignIn: true,
          username: "smtp-user",
          passwordCipher: "invalid-ciphertext",
          ...overrides,
        }),
      },
    } as unknown as PrismaClient;
    let failed = false;
    await assert.rejects(
      processNotificationEmailJob(classificationPayload, {
        rememberAccepted: async () => {},
        getEmailConfig: (organizationId) => getOrganizationEmailConfig(prisma, organizationId),
        send: async () => assert.fail("Invalid settings must not send"),
        markDeliveryFailed: async () => {
          failed = true;
        },
        markDeliveryRetrying: async () => assert.fail("Invalid settings must not be retried"),
      }),
      UnrecoverableError,
    );
    assert.equal(failed, true);
  });
}

const classificationPayload = {
  organizationId: 7,
  recipientId: 12,
  recipientType: "user",
  email: "person@example.com",
  subject: "Notification",
  body: "Hello",
  outboxEventId: 42,
};
