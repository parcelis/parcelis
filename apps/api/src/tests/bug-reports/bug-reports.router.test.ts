import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { getEmailTransporter, resetEmailTransporter } from "@parcelis/email";
import { bugReportInputSchema, bugReportMaxImageBytes, sanitizeBugReportUrl, userRoleValues } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
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
  const send = mock.method(getEmailTransporter(), "sendMail", async () => {
    throw new Error("private SMTP password");
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
  for (const input of [request(), request({ "content-length": String(16 * 1024 * 1024 + 1) })]) {
    const response = await limitBugReportRequest(input);
    assert.ok(response instanceof Response);
    assert.equal(response.status, 413);
  }
  const allowed = new Request("http://localhost/trpc/bugReports.submit", { method: "POST", body: form() });
  const bounded = await limitBugReportRequest(allowed);
  assert.ok(bounded instanceof Request);
  assert.equal((await bounded.formData()).get("description"), form().get("description"));
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
  const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");
  const { router } = await import("../../router/trpc");
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
