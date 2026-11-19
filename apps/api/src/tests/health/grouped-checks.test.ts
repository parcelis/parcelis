import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { checkApplicationServices } from "../../modules/application-checks";
import { groupChecks, verifyStorageTransfer, type ServiceCheck } from "../../modules/service-checks";
import { renderStatusPage } from "../../status/page";
import { updateComponent, visibleComponent } from "../../status/state";

async function createProbeServers(t: TestContext) {
  const urls = [];
  for (const body of ["Parcelis", '{"service":"parcelis-api"}']) {
    const server = createServer((_request, response) => response.end(body));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    urls.push(`http://127.0.0.1:${address.port}`);
  }
  return { webUrl: `${urls[0]}/login`, apiUrl: `${urls[1]}/health` };
}

const sample = (id: string, status: ServiceCheck["status"]): ServiceCheck => ({
  id,
  name: id,
  status,
  latencyMs: 1,
  checkedAt: new Date().toISOString(),
});

test("grouped checks distinguish partial failure, outage, and unmeasured checks", () => {
  const group = (core: ServiceCheck["status"], child: ServiceCheck["status"]) =>
    groupChecks("workers", "Workers", [sample("processing", core), sample("email", child)], "processing");
  assert.equal(group("operational", "operational").status, "operational");
  assert.equal(group("operational", "down").status, "degraded");
  assert.equal(group("down", "operational").status, "down");
  assert.equal(group("operational", "unknown").status, "unknown");
  const stale = visibleComponent(updateComponent(undefined, group("operational", "operational")), Date.now() + 91_000);
  assert.equal(stale.status, "unknown");
  assert.ok(stale.checks?.every((check) => check.status === "unknown"));
});

test("storage probe cleans up its object after success or upload/download failure", async () => {
  for (const failure of ["none", "upload", "download", "remove"]) {
    const calls: string[] = [];
    const step = (name: string) => async () => {
      calls.push(name);
      if (failure === name) throw new Error(name);
    };
    const probe = verifyStorageTransfer({ upload: step("upload"), download: step("download"), remove: step("remove") });
    if (failure === "none") await probe;
    else await assert.rejects(probe);
    assert.equal(calls.at(-1), "remove");
    assert.deepEqual(calls, failure === "upload" ? ["upload", "remove"] : ["upload", "download", "remove"]);
  }
});

test("authentication checks do not report success without a monitoring account", async (t) => {
  const { webUrl, apiUrl } = await createProbeServers(t);
  const before = { email: process.env.STATUS_AUTH_EMAIL, password: process.env.STATUS_AUTH_PASSWORD };
  delete process.env.STATUS_AUTH_EMAIL;
  delete process.env.STATUS_AUTH_PASSWORD;
  t.after(() => {
    if (before.email === undefined) delete process.env.STATUS_AUTH_EMAIL;
    else process.env.STATUS_AUTH_EMAIL = before.email;
    if (before.password === undefined) delete process.env.STATUS_AUTH_PASSWORD;
    else process.env.STATUS_AUTH_PASSWORD = before.password;
  });
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrfToken: "csrf" });
    if (url.endsWith("/trpc/auth.me"))
      return Response.json({ error: { data: { code: "UNAUTHORIZED" } } }, { status: 401 });
    throw new Error(`Unexpected authentication request: ${url}`);
  });
  const [web, api] = await checkApplicationServices(webUrl, apiUrl);
  assert.equal(web?.status, "unknown");
  assert.equal(api?.status, "unknown");
  assert.equal(api?.checks?.find((check) => check.id === "auth-boundary")?.status, "operational");
});

test("sign-in verifies the web session and a protected API request using chunked cookies", async (t) => {
  const { webUrl, apiUrl } = await createProbeServers(t);
  const before = { email: process.env.STATUS_AUTH_EMAIL, password: process.env.STATUS_AUTH_PASSWORD };
  process.env.STATUS_AUTH_EMAIL = "monitor@example.test";
  process.env.STATUS_AUTH_PASSWORD = "private-monitor-password";
  t.after(() => {
    if (before.email === undefined) delete process.env.STATUS_AUTH_EMAIL;
    else process.env.STATUS_AUTH_EMAIL = before.email;
    if (before.password === undefined) delete process.env.STATUS_AUTH_PASSWORD;
    else process.env.STATUS_AUTH_PASSWORD = before.password;
  });
  let protectedRequests = 0;
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const cookie = new Headers(init?.headers).get("cookie");
    if (url.endsWith("/api/auth/csrf")) return Response.json({ csrfToken: "csrf" });
    if (url.endsWith("/callback/credentials")) {
      const response = Response.json({ url: "http://web.test" });
      response.headers.append("Set-Cookie", "next-auth.session-token.0=first; HttpOnly");
      response.headers.append("Set-Cookie", "next-auth.session-token.1=second; HttpOnly");
      return response;
    }
    if (url.endsWith("/api/auth/session")) {
      assert.ok(cookie?.includes("session-token.0=first"));
      return Response.json({ user: { email: "monitor@example.test" } });
    }
    if (url.endsWith("/trpc/auth.me")) {
      if (!cookie) return Response.json({ error: { data: { code: "UNAUTHORIZED" } } }, { status: 401 });
      assert.ok(cookie.includes("session-token.1=second"));
      protectedRequests++;
      return Response.json({ result: { data: { user: { email: "monitor@example.test" } } } });
    }
    throw new Error(`Unexpected authentication request: ${url}`);
  });
  const checks = await checkApplicationServices(webUrl, apiUrl);
  assert.deepEqual(
    checks.map((check) => check.id),
    ["web", "api"],
  );
  assert.ok(checks.every((check) => check.status === "operational"));
  assert.equal(protectedRequests, 1);
  assert.ok(!JSON.stringify(checks).includes("private-monitor-password"));
});

test("grouped detail names and notes are escaped", () => {
  const child = { ...sample("email", "down"), name: "<script>private</script>", note: "<img src=x>" };
  const component = updateComponent(
    undefined,
    groupChecks("workers", "Workers", [sample("processing", "operational"), child], "processing"),
  );
  const page = renderStatusPage(component.status, [component]);
  assert.ok(page.includes("<details"));
  assert.ok(!page.includes("<script>"));
  assert.ok(!page.includes("<img src=x>"));
});
