import assert from "node:assert/strict";
import test from "node:test";
import { hashSessionToken } from "../../modules/auth";
import type { PrismaClient } from "@parcelis/db";
import { Hono } from "hono";
import { createJobDashboardHandler } from "../../modules/job-dashboard";

function createPrisma(
  role: "administrator" | "property_manager" | null,
  overrides: Partial<{
    tokenHash: string;
    expiresAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
    accountStatus: string;
  }> = {},
) {
  const session = {
    tokenHash: hashSessionToken("test-token"),
    expiresAt: new Date("2100-01-01"),
    revokedAt: null as Date | null,
    lastSeenAt: new Date(),
    accountStatus: "active",
    ...overrides,
  };
  const queries: unknown[] = [];
  const prisma = {
    session: {
      findFirst: async (query: {
        where: {
          tokenHash?: string;
          expiresAt?: { gt: Date };
          lastSeenAt?: { gt: Date };
          revokedAt?: Date | null;
          user?: { accountStatus?: string };
        };
      }) => {
        queries.push(query);
        const { where } = query;
        if (
          (where.tokenHash !== undefined && session.tokenHash !== where.tokenHash) ||
          (where.lastSeenAt !== undefined && session.lastSeenAt <= where.lastSeenAt.gt) ||
          (where.expiresAt !== undefined && session.expiresAt <= where.expiresAt.gt) ||
          (where.revokedAt !== undefined && session.revokedAt !== where.revokedAt) ||
          (where.user?.accountStatus !== undefined && session.accountStatus !== where.user.accountStatus)
        ) {
          return null;
        }
        return role ? { user: { role } } : null;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, queries };
}

test("job dashboard rejects requests without a Parcelis session before querying the database", async () => {
  const { prisma, queries } = createPrisma("administrator");
  const response = await createJobDashboardHandler(prisma, () => {
    assert.fail("Unauthenticated requests must not initialize the dashboard.");
  })(new Request("http://localhost/admin/jobs/"));
  assert.equal(response.status, 401);
  assert.equal(queries.length, 0);
});

test("job dashboard permits active sessions without renewing activity", async () => {
  const { prisma, queries } = createPrisma("administrator");
  const app = new Hono().get("/admin/jobs/", (context) => context.text("ready"));
  const response = await createJobDashboardHandler(
    prisma,
    () => app,
  )(new Request("http://localhost/admin/jobs/", { headers: { cookie: "parcelis_session_v2=test-token" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(queries.length, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

for (const [name, overrides] of [
  ["expired", { expiresAt: new Date("2000-01-01") }],
  ["idle", { lastSeenAt: new Date("2000-01-01") }],
  ["revoked", { revokedAt: new Date("2000-01-01") }],
  ["inactive", { accountStatus: "disabled" }],
  ["unmatched token", { tokenHash: hashSessionToken("another-token") }],
] as const) {
  test(`job dashboard rejects ${name} sessions`, async (t) => {
    if (name === "idle") {
      const previous = process.env.SESSION_IDLE_TIMEOUT_ENABLED;
      process.env.SESSION_IDLE_TIMEOUT_ENABLED = "true";
      t.after(() => {
        if (previous === undefined) delete process.env.SESSION_IDLE_TIMEOUT_ENABLED;
        else process.env.SESSION_IDLE_TIMEOUT_ENABLED = previous;
      });
    }

    const { prisma, queries } = createPrisma("administrator", overrides);
    const response = await createJobDashboardHandler(prisma, () => {
      assert.fail(`${name} sessions must not reach the dashboard.`);
    })(new Request("http://localhost/admin/jobs/", { headers: { cookie: "parcelis_session_v2=test-token" } }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
    assert.equal(queries.length, 1);
  });
}
