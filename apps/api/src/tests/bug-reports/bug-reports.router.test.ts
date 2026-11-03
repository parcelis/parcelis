import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { EmailConfigurationError, getEmailTransporter, resetEmailTransporter } from "@parcelis/email";
import { bugReportInputSchema, bugReportMaxImageBytes, sanitizeBugReportUrl, userRoleValues } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { router } from "../../router/trpc";
import { bugReportsRouter } from "../../router/bug-reports.router";
import type { Context } from "../../router/context";
import { resetRateLimits } from "../../modules/login-rate-limit";
import { limitBugReportRequest } from "../../modules/bug-report-request";

function context(role = "maintenance", accountStatus = "active") {
  return {
    prisma: {
      organizationEmailSettings: {
        findUnique: async ({ where }: { where: { organizationId: number } }) => {
          assert.equal(where.organizationId, 42);
          return null;
        },
      },
    } as unknown as PrismaClient,
    session: { userId: 7, user: { id: 7, role, accountStatus, email: "private@example.com", name: "Private staff" } },
    organization: { organizationId: 42 },
    req: { headers: {} },
  } as unknown as Context;
}
function form(description = "The save button does not respond.") {
  const data = new FormData();
  data.set("description", description);
  return data;
}
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const screenshot = () => new File([pngBytes], "local-private-name.png", { type: "image/png" });

const emailEnvironment = {
  EMAIL_FROM: "tests@example.com",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_USER: "test",
  SMTP_PASSWORD: "test",
};
const originalEnvironment = { ...process.env };
test.beforeEach(() => {
  Object.assign(process.env, emailEnvironment);
  resetRateLimits();
  resetEmailTransporter();
});
test.afterEach(() => {
  for (const key of Object.keys(emailEnvironment)) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
  mock.restoreAll();
  resetEmailTransporter();
});

function captureMail() {
  const messages: Record<string, unknown>[] = [];
  mock.method(getEmailTransporter(), "sendMail", async (message: Record<string, unknown>) => {
    messages.push(message);
    return { messageId: "test-only", accepted: ["support@parcelis.dev"], rejected: [] };
  });
  return messages;
}

test("all active staff roles can send a minimal private report without record permissions", async () => {
  const messages = captureMail();
  for (const role of userRoleValues) {
    resetRateLimits();
    assert.deepEqual(await bugReportsRouter.createCaller(context(role)).submit(form()), { sent: true });
  }
  assert.equal(messages.length, userRoleValues.length);
  for (const message of messages) {
    assert.equal(message.to, "support@parcelis.dev");
    assert.equal(message.text, "Parcelis bug report\n\nThe save button does not respond.");
    assert.deepEqual(message.attachments, []);
    assert.doesNotMatch(JSON.stringify(message), /private@example.com|Private staff/);
  }
});

test("blocks anonymous, non-staff, inactive and organization-less sessions", async () => {
  const messages = captureMail();
  for (const ctx of [
    { ...context(), session: null },
    { ...context(), session: null, principal: { kind: "api-token" } },
    context("tenant"),
    context("resident"),
    context("maintenance", "disabled"),
    context("maintenance", "pending"),
    { ...context(), organization: null },
  ]) {
    await assert.rejects(
      bugReportsRouter.createCaller(ctx as Context).submit(form()),
      (error: unknown) => error instanceof TRPCError && ["FORBIDDEN", "UNAUTHORIZED"].includes(error.code),
    );
  }
  assert.equal(messages.length, 0);
});

test("sends only reviewed details and image buffers, strips URL credentials/query/fragment, escapes HTML", async () => {
  const messages = captureMail();
  const data = form("<script>alert('test')</script>");
  data.set("pageUrl", "https://user:password@example.com/o/demo/income?token=secret#private");
  data.set("browserVersion", "Test Browser");
  data.set("appVersion", "0.4.1");
  data.set("screenshots", screenshot());
  data.set("to", "attacker@example.com");
  data.set("organizationId", "999");
  await bugReportsRouter.createCaller(context()).submit(data);
  assert.match(String(messages[0]?.text), /Page: https:\/\/example.com\/o\/demo\/income/);
  assert.doesNotMatch(JSON.stringify(messages), /password|secret|private-name|attacker|999/);
  assert.doesNotMatch(String(messages[0]?.html), /<script>/);
  assert.match(String(messages[0]?.html), /&lt;script&gt;/);
  assert.deepEqual(messages[0]?.attachments, [
    { content: pngBytes, contentType: "image/png", filename: "screenshot-1.png" },
  ]);
});

test("rejects invalid descriptions, URLs, counts, sizes and screenshot content", async () => {
  captureMail();
  assert.equal(bugReportInputSchema.safeParse({ description: " " }).success, false);
  assert.throws(() => sanitizeBugReportUrl("javascript:alert(1)"));
  assert.equal(
    bugReportInputSchema.safeParse({ description: "x", screenshots: Array.from({ length: 4 }, screenshot) }).success,
    false,
  );
  assert.equal(
    bugReportInputSchema.safeParse({
      description: "x",
      screenshots: [new File([new Uint8Array(bugReportMaxImageBytes + 1)], "large.png", { type: "image/png" })],
    }).success,
    false,
  );
  assert.equal(
    bugReportInputSchema.safeParse({
      description: "x",
      screenshots: [new File(["svg"], "image.svg", { type: "image/svg+xml" })],
    }).success,
    false,
  );
  const data = form();
  data.set("screenshots", new File(["not an image"], "fake.png", { type: "image/png" }));
  await assert.rejects(
    bugReportsRouter.createCaller(context()).submit(data),
    (error: unknown) => error instanceof TRPCError && error.code === "BAD_REQUEST",
  );
});

test("reports SMTP failure and rejected delivery without leaking server details; retry can succeed", async () => {
  const logged = mock.method(console, "error", () => {});
  const send = mock.method(getEmailTransporter(), "sendMail", async () => {
    throw Object.assign(new Error("private SMTP password"), {
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH private SMTP password",
    });
  });
  const caller = bugReportsRouter.createCaller(context());
  await assert.rejects(
    caller.submit(form()),
    (error: unknown) =>
      error instanceof TRPCError && error.message.includes("Try again") && !error.message.includes("password"),
  );
  send.mock.mockImplementation(async () => ({
    messageId: "rejected",
    envelope: { from: "test@example.com", to: ["support@parcelis.dev"] },
    accepted: [],
    rejected: ["support@parcelis.dev"],
  }));
  await assert.rejects(caller.submit(form()), /could not be sent/);
  send.mock.mockImplementation(async () => ({
    messageId: "accepted",
    envelope: { from: "test@example.com", to: ["support@parcelis.dev"] },
    accepted: ["support@parcelis.dev"],
    rejected: [],
  }));
  assert.deepEqual(await caller.submit(form()), { sent: true });
  assert.equal(logged.mock.calls.length, 2);
  assert.deepEqual(logged.mock.calls[0]?.arguments, [
    "Failed to send bug report email.",
    { organizationId: 42, failureType: "delivery", code: "EAUTH", responseCode: 535 },
  ]);
  assert.doesNotMatch(JSON.stringify(logged.mock.calls), /password|private@example.com|save button|AUTH private/);
});

test("logs configuration failures without exposing the error or its cause", async () => {
  const logged = mock.method(console, "error", () => {});
  const ctx = context();
  mock.method(ctx.prisma.organizationEmailSettings, "findUnique", async () => {
    throw new EmailConfigurationError("private configuration details", { cause: new Error("private password") });
  });
  await assert.rejects(bugReportsRouter.createCaller(ctx).submit(form()), /could not be sent/);
  assert.deepEqual(logged.mock.calls[0]?.arguments, [
    "Failed to send bug report email.",
    { organizationId: 42, failureType: "configuration", code: undefined, responseCode: undefined },
  ]);
  assert.doesNotMatch(JSON.stringify(logged.mock.calls), /private|password|save button/);
});

test("accepts unusual original filenames and always sends generic attachment names", async () => {
  const messages = captureMail();
  const filename = `${"x".repeat(230)}\nprivate.png`;
  const data = form();
  data.set("screenshots", new File([pngBytes], filename, { type: "image/png" }));
  await bugReportsRouter.createCaller(context()).submit(data);
  assert.deepEqual(messages[0]?.attachments, [
    { content: pngBytes, contentType: "image/png", filename: "screenshot-1.png" },
  ]);
});

test("rate limits repeated submissions per user", async () => {
  const messages = captureMail();
  const caller = bugReportsRouter.createCaller(context());
  for (let i = 0; i < 5; i++) await caller.submit(form());
  await assert.rejects(
    caller.submit(form()),
    (error: unknown) => error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS",
  );
  assert.equal(messages.length, 5);
});

test("bounds multipart request size with or without Content-Length", async () => {
  const request = (headers = {}) =>
    new Request("http://localhost/trpc/bugReports.submit", {
      method: "POST",
      headers,
      body: new Uint8Array(16 * 1024 * 1024 + 1),
    });
  const declared = await limitBugReportRequest(request({ "content-length": String(16 * 1024 * 1024 + 1) }));
  assert.ok(declared instanceof Response);
  assert.equal(declared.status, 413);
  const streamed = await limitBugReportRequest(request());
  assert.ok(streamed instanceof Request);
  await assert.rejects(
    streamed.arrayBuffer(),
    (error: unknown) => error instanceof TRPCError && error.code === "PAYLOAD_TOO_LARGE",
  );
  const allowed = new Request("http://localhost/trpc/bugReports.submit", { method: "POST", body: form() });
  const bounded = await limitBugReportRequest(allowed);
  assert.ok(bounded instanceof Request);
  assert.equal((await bounded.formData()).get("description"), form().get("description"));
});

test("leaves unrelated multipart procedures completely untouched", async () => {
  const request = new Request("http://localhost/trpc/futureUpload.submit", {
    method: "POST",
    headers: {
      origin: "https://untrusted.example",
      "content-type": "multipart/form-data; boundary=test",
      "content-length": String(17 * 1024 * 1024),
    },
    body: "unrelated request",
  });
  assert.equal(await limitBugReportRequest(request), request);
  assert.equal(request.bodyUsed, false);
  assert.equal(request.body?.locked, false);
});

test("normalizes configured origins with a trailing slash", async () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = "https://app.example.com/";
  try {
    const request = new Request("http://api.internal/trpc/bugReports.submit", {
      method: "POST",
      headers: { origin: "https://app.example.com" },
      body: form(),
    });
    const bounded = await limitBugReportRequest(request);
    assert.ok(bounded instanceof Request);
    assert.equal((await bounded.formData()).get("description"), form().get("description"));
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});

async function streamReport(ctx: Context, byteLength = 1024) {
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(byteLength));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const original = new Request("http://localhost/trpc/bugReports.submit", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test", cookie: "forged-session-cookie=invalid" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const request = await limitBugReportRequest(original);
  assert.ok(request instanceof Request);
  assert.equal(reads, 0, "The limiter must not read the upload eagerly");
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: router({ bugReports: bugReportsRouter }),
    createContext: () => ctx,
  });
  return { response, reads };
}

test("rejects unauthenticated or disallowed uploads without reading the request body", async () => {
  for (const [ctx, status] of [
    [{ ...context(), session: null }, 401],
    [context("tenant"), 403],
    [{ ...context(), organization: null }, 403],
  ] as const) {
    const result = await streamReport(ctx as Context);
    assert.equal(result.response.status, status);
    assert.equal(result.reads, 0);
  }
});

test("enforces the submission rate limit before reading the upload", async () => {
  captureMail();
  const caller = bugReportsRouter.createCaller(context());
  for (let i = 0; i < 5; i++) await caller.submit(form());
  const result = await streamReport(context());
  assert.equal(result.response.status, 429);
  assert.equal(result.reads, 0);
});

test("returns HTTP 413 for oversized uploads without Content-Length", async () => {
  const result = await streamReport(context(), 16 * 1024 * 1024 + 1);
  assert.equal(result.response.status, 413, JSON.stringify(await result.response.json()));
  assert.equal(result.reads, 1);
});

test("rejects cross-origin multipart submissions before reading the body", async () => {
  const request = new Request("http://localhost/trpc/bugReports.submit", {
    method: "POST",
    headers: { origin: "https://untrusted.example" },
    body: form(),
  });
  const response = await limitBugReportRequest(request);
  assert.ok(response instanceof Response);
  assert.equal(response.status, 403);
});

test("multipart tRPC transport accepts all three maximum-size screenshots", async () => {
  const messages = captureMail();
  const data = form();
  const image = new Uint8Array(bugReportMaxImageBytes);
  image.set(pngBytes);
  for (let i = 0; i < 3; i++) data.append("screenshots", new File([image], `image-${i}.png`, { type: "image/png" }));
  const original = new Request("http://localhost/trpc/bugReports.submit", { method: "POST", body: data });
  const request = await limitBugReportRequest(original);
  assert.ok(request instanceof Request);
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: router({ bugReports: bugReportsRouter }),
    createContext: () => context(),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { result: { data: { sent: true } } });
  const attachments = messages[0]?.attachments as Array<{ content: Buffer }>;
  assert.equal(attachments.length, 3);
  assert.ok(attachments.every((attachment) => attachment.content.length === bugReportMaxImageBytes));
});
