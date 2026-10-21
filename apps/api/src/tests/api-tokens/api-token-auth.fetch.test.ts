import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createJobDashboardHandler } from "../../modules/job-dashboard";
import { hashApiToken } from "../../modules/api-tokens";
import { appRouter } from "../../router/app.router";
import { createFetchContext } from "../../router/fetch-context";
import { handlePreflight } from "../../router/http";
import { handleRestRequest } from "../../router/rest-handler";
import { createTestSessionCookie } from "../auth/session-cookie";

const token = `pcls_api_${"A".repeat(43)}`;

function fixture() {
  const organization = { id: 3, slug: "portfolio" };
  const row = {
    id: "token-id",
    name: "Bruno",
    organizationId: 3,
    organization,
    expiresAt: null as Date | null,
    revokedAt: null as Date | null,
  };
  let sessionReads = 0;
  let tokenReads = 0;
  let failLookup = false;
  let failTelemetry = false;
  const scopes: number[] = [];
  const prisma = {
    apiToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        tokenReads++;
        if (failLookup) throw new Error(`private database error ${token}`);
        return where.tokenHash === hashApiToken(token) ? row : null;
      },
      updateMany: async () => {
        if (failTelemetry) throw new Error(`private telemetry error ${token}`);
        return { count: 1 };
      },
    },
    user: {
      findUnique: async () => {
        sessionReads++;
        return { id: 7, role: "administrator", accountStatus: "active", defaultOrganizationId: 3 };
      },
    },
    organization: { findFirst: async () => organization },
    tag: {
      findMany: async ({ where }: { where: { organizationId: number } }) => {
        scopes.push(where.organizationId);
        return [{ id: 1, label: `Organization ${where.organizationId}`, sortOrder: 0 }];
      },
    },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    row,
    scopes,
    sessionReads: () => sessionReads,
    tokenReads: () => tokenReads,
    failLookup: () => {
      failLookup = true;
    },
    failTelemetry: () => {
      failTelemetry = true;
    },
  };
}

function request(path = "/tags", headers: HeadersInit = { authorization: `Bearer ${token}` }) {
  return new Request(`http://localhost/api/v1${path}`, { headers });
}

test("real REST adapter accepts a token alone and resolves its organization on every request", async () => {
  const data = fixture();
  for (let i = 0; i < 2; i++) {
    const response = await handleRestRequest(data.prisma, request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].label, "Organization 3");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.deepEqual(data.scopes, [3, 3]);
  assert.equal(data.tokenReads(), 2);
  assert.equal(data.sessionReads(), 0);
});

test("revocation takes effect on the next request", async () => {
  const data = fixture();
  assert.equal((await handleRestRequest(data.prisma, request())).status, 200);
  data.row.revokedAt = new Date();
  const response = await handleRestRequest(data.prisma, request());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
});

test("expired and unknown tokens return the same generic 401", async () => {
  const data = fixture();
  data.row.expiresAt = new Date(0);
  const expired = await handleRestRequest(data.prisma, request());
  const unknown = await handleRestRequest(
    data.prisma,
    request("/tags", {
      authorization: `Bearer pcls_api_${"B".repeat(43)}`,
    }),
  );
  assert.equal(expired.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal((await expired.json()).message, (await unknown.json()).message);
});

test("missing credentials fail but a cookie alone retains normal REST authentication", async () => {
  const data = fixture();
  assert.equal((await handleRestRequest(data.prisma, request("/tags", {}))).status, 401);
  const response = await handleRestRequest(
    data.prisma,
    request("/tags", {
      cookie: await createTestSessionCookie(),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(data.tokenReads(), 0);
  assert.equal(data.sessionReads(), 1);
});

test("invalid Authorization takes precedence over a valid browser cookie", async () => {
  const data = fixture();
  for (const authorization of ["", "Basic invalid", `Bearer pcls_api_${"B".repeat(43)}`]) {
    const response = await handleRestRequest(
      data.prisma,
      request("/tags", {
        authorization,
        cookie: await createTestSessionCookie(),
      }),
    );
    assert.equal(response.status, 401);
  }
  assert.equal(data.sessionReads(), 0);
});

test("duplicate or combined Authorization headers are rejected", async () => {
  const data = fixture();
  const headers = new Headers();
  headers.append("Authorization", `Bearer ${token}`);
  headers.append("authorization", `Bearer ${token}`);
  assert.equal((await handleRestRequest(data.prisma, request("/tags", headers))).status, 401);
  assert.equal(data.tokenReads(), 0);
});

test("valid tokens override cookies and reject conflicting organization headers", async () => {
  const data = fixture();
  const headers = {
    Authorization: `bEaReR ${token}`,
    cookie: await createTestSessionCookie(),
    "x-parcelis-organization-slug": "portfolio",
  };
  assert.equal((await handleRestRequest(data.prisma, request("/tags", headers))).status, 200);
  headers["x-parcelis-organization-slug"] = "another-organization";
  assert.equal((await handleRestRequest(data.prisma, request("/tags", headers))).status, 403);
  assert.equal(data.sessionReads(), 0);
});

test("lookup failures log safe diagnostics and return sanitized 500 responses without cookie fallback", async (t) => {
  const data = fixture();
  data.failLookup();
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  const response = await handleRestRequest(
    data.prisma,
    request(`/tags?private=${token}`, {
      authorization: `Bearer ${token}`,
      cookie: await createTestSessionCookie(),
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes(token), false);
  assert.equal(data.sessionReads(), 0);
  assert.deepEqual(diagnostics, [["REST request failed.", { status: 500, path: "/api/v1/tags" }]]);
  assert.equal(JSON.stringify(diagnostics).includes(token), false);
});

test("last-used write failures are nonfatal and diagnostics omit credentials", async (t) => {
  const data = fixture();
  data.failTelemetry();
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  assert.equal((await handleRestRequest(data.prisma, request())).status, 200);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(diagnostics, [["API-token last-used update failed."]]);
});

test("public health and preflight ignore invalid credentials and retain CORS", async () => {
  const data = fixture();
  data.failLookup();
  const health = await handleRestRequest(data.prisma, request("/health", { authorization: "invalid" }));
  assert.equal(health.status, 200);
  assert.equal(data.tokenReads(), 0);
  const origin = new URL(process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`).origin;
  const preflight = handlePreflight(
    new Request("http://localhost/api/v1/tags", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-headers": "authorization" },
    }),
    ["GET", "POST"],
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-headers"), "authorization");
});

test("tRPC ignores bearer tokens and preserves independently valid cookies", async () => {
  const data = fixture();
  for (const cookie of [undefined, await createTestSessionCookie()]) {
    const req = new Request("http://localhost/trpc/tags.list", {
      headers: { authorization: `Bearer ${token}`, ...(cookie ? { cookie } : {}) },
    });
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req,
      router: appRouter,
      createContext: createFetchContext(data.prisma, req),
    });
    assert.equal(response.status, cookie ? 200 : 401);
  }
  assert.equal(data.tokenReads(), 0);
});

test("token principals cannot access account or token-management procedures", async () => {
  const data = fixture();
  const context = await createFetchContext(data.prisma, request(), "rest")();
  const caller = appRouter.createCaller(context);
  for (const operation of [() => caller.apiTokens.list({}), () => caller.auth.me()]) {
    await assert.rejects(
      operation,
      (error: unknown) => error instanceof Error && "code" in error && error.code === "UNAUTHORIZED",
    );
  }
});

test("bearer tokens cannot initialize or authenticate the jobs dashboard", async () => {
  const data = fixture();
  let initialized = false;
  const handler = createJobDashboardHandler(data.prisma, () => {
    initialized = true;
    throw new Error("Dashboard must remain session-only.");
  });
  const response = await handler(
    new Request("http://localhost/admin/jobs", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(initialized, false);
  assert.equal(data.tokenReads(), 0);
  assert.equal(data.sessionReads(), 0);
});

test("a slow telemetry write does not delay the business response", async () => {
  const data = fixture();
  data.prisma.apiToken.updateMany = (() => new Promise(() => {})) as typeof data.prisma.apiToken.updateMany;
  const response = await handleRestRequest(data.prisma, request());
  assert.equal(response.status, 200);
});

test("empty organization selections behave like absent headers for bearer and cookie authentication", async () => {
  const data = fixture();
  const cookie = await createTestSessionCookie();
  const authenticationHeaders: HeadersInit[] = [{ authorization: `Bearer ${token}` }, { cookie }];
  for (const credentials of authenticationHeaders) {
    for (const slug of [undefined, "", "portfolio"]) {
      const headers = new Headers(credentials);
      if (slug !== undefined) headers.set("x-parcelis-organization-slug", slug);
      const response = await handleRestRequest(data.prisma, request("/tags", headers));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data[0].label, "Organization 3");
    }
  }
  assert.deepEqual(data.scopes, [3, 3, 3, 3, 3, 3]);
});
