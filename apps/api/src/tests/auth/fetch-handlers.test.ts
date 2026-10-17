import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { createTestSessionCookie } from "./session-cookie";
import { appRouter } from "../../router/app.router";
import { createFetchContext, getClientIp } from "../../router/fetch-context";
import { applyApiHeaders, handlePreflight } from "../../router/http";
import { publicRouter } from "../../router/public.router";

function fixture({ member = true } = {}) {
  const organization = { id: 3, slug: "portfolio" };
  const user = {
    id: 7,
    email: "owner@example.com",
    role: "property_manager",
    accountStatus: "active",
    defaultOrganizationId: organization.id,
  };
  let membershipQuery: unknown;
  let membershipReads = 0;
  const prisma = {
    user: { findUnique: async () => user },
    organizationMembership: {
      findFirst: async (query: unknown) => {
        membershipReads++;
        membershipQuery = query;
        return member ? { organizationId: organization.id, role: "owner", organization } : null;
      },
    },
    tag: { findMany: async () => [{ id: 1, label: "Priority", sortOrder: 0 }] },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    membershipQuery: () => membershipQuery,
    membershipReads: () => membershipReads,
  };
}

async function trpc(request: Request, prisma: PrismaClient) {
  return fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext: createFetchContext(prisma, request),
  });
}

async function rest(request: Request, prisma: PrismaClient) {
  return createOpenApiFetchHandler({
    endpoint: "/api/v1",
    req: request,
    router: publicRouter,
    createContext: createFetchContext(prisma, request),
  });
}

test("legacy login and logout procedures are removed", async () => {
  for (const procedure of ["auth.login", "auth.logout"]) {
    const response = await trpc(
      new Request(`http://localhost/trpc/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      {} as PrismaClient,
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("an authenticated batch resolves organization access once", async () => {
  const data = fixture();
  const response = await trpc(
    new Request("http://localhost/trpc/tags.list,tags.list?batch=1", {
      headers: {
        cookie: await createTestSessionCookie(),
        "x-parcelis-organization-slug": "portfolio",
      },
    }),
    data.prisma,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.length, 2);
  assert.equal(result[0].result.data[0].label, "Priority");
  assert.equal(result[1].result.data[0].label, "Priority");
  assert.equal(data.membershipReads(), 1);
  assert.deepEqual(data.membershipQuery(), {
    where: { userId: 7, organization: { slug: "portfolio" } },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(response.headers.get("set-cookie"), null);
});

test("REST rejects a JWT whose user no longer exists", async () => {
  const prisma = {
    user: { findUnique: async () => null },
  } as unknown as PrismaClient;
  const response = await rest(
    new Request("http://localhost/api/v1/tags", {
      headers: { cookie: await createTestSessionCookie() },
    }),
    prisma,
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHORIZED");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("REST preserves the data envelope and validation errors", async () => {
  const data = fixture();
  const tags = await rest(
    new Request("http://localhost/api/v1/tags", {
      headers: { cookie: await createTestSessionCookie() },
    }),
    data.prisma,
  );
  assert.equal(tags.status, 200);
  assert.deepEqual(await tags.json(), { data: [{ id: 1, label: "Priority", sortOrder: 0 }] });
  const invalid = await rest(new Request("http://localhost/api/v1/properties/not-a-number"), data.prisma);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "BAD_REQUEST");
});

test("organization access is still required for the REST wrappers", async () => {
  const data = fixture({ member: false });
  const response = await rest(
    new Request("http://localhost/api/v1/tags", {
      headers: {
        cookie: await createTestSessionCookie(),
        "x-parcelis-organization-slug": "unavailable",
      },
    }),
    data.prisma,
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "FORBIDDEN");
});

test("CORS permits the configured origin and denies browser access for other origins", (t) => {
  const original = process.env.WEB_ORIGIN;
  t.after(() => {
    if (original === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = original;
  });
  process.env.WEB_ORIGIN = "https://parcelis.example";
  const response = handlePreflight(
    new Request("http://localhost/trpc/auth.register", {
      method: "OPTIONS",
      headers: {
        origin: "https://parcelis.example",
        "access-control-request-headers": "content-type,x-parcelis-organization-slug",
      },
    }),
    ["GET", "POST"],
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://parcelis.example");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const rejected = applyApiHeaders(
    new Request("http://localhost/trpc/auth.register", { headers: { origin: "https://other.example" } }),
    new Response(),
  );
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("invalid web origins omit CORS permissions without breaking API responses", (t) => {
  const original = process.env.WEB_ORIGIN;
  t.after(() => {
    if (original === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = original;
  });
  for (const value of ["", "parcelis.example.com", "localhost:3000", "null", "file:///tmp", "ftp://example.com"]) {
    process.env.WEB_ORIGIN = value;
    for (const origin of [value, "null", "https://parcelis.example"]) {
      const request = new Request("http://localhost/trpc/auth.register", { headers: { origin } });
      for (const response of [
        applyApiHeaders(request, new Response("ready")),
        handlePreflight(request, ["GET", "POST"]),
      ]) {
        assert.ok(response.status < 400);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
        assert.equal(response.headers.get("access-control-allow-credentials"), null);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.match(response.headers.get("vary") ?? "", /Origin/);
      }
    }
  }
});

test("CORS accepts valid HTTP and HTTPS origins and normalizes their URLs", (t) => {
  const original = process.env.WEB_ORIGIN;
  t.after(() => {
    if (original === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = original;
  });
  for (const value of ["http://localhost:30000", "https://parcelis.example/path"]) {
    process.env.WEB_ORIGIN = value;
    const origin = new URL(value).origin;
    const response = applyApiHeaders(new Request("http://localhost/trpc", { headers: { origin } }), new Response());
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  }
});

test("forwarded client IPs require explicit proxy trust and use the trusted end of the chain", () => {
  const request = new Request("http://localhost/trpc/auth.register", {
    headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.8, 127.0.0.1" },
  });
  assert.equal(getClientIp(request, 0), undefined);
  assert.equal(getClientIp(request, 2), "203.0.113.8");
  assert.equal(getClientIp(request, 4), undefined);
  assert.equal(getClientIp(new Request("http://localhost"), 2), undefined);
  assert.equal(
    getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "invalid, 127.0.0.1" } }), 2),
    undefined,
  );
});
