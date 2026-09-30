import assert from "node:assert/strict";
import test from "node:test";
import { hashSessionToken } from "../../modules/auth";
import type { PrismaService } from "../../modules/prisma.service";
import { createJobDashboardAuthMiddleware } from "../../modules/job-dashboard-auth.middleware";

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
          (where.user?.accountStatus !== undefined &&
            session.accountStatus !== where.user.accountStatus)
        ) {
          return null;
        }
        return role ? { user: { role } } : null;
      },
    },
  } as unknown as PrismaService;

  return { prisma, queries };
}

function createResponse() {
  const result = { statusCode: 200, headers: {} as Record<string, string> };
  const response = {
    clearCookie() {},
    sendStatus(statusCode: number) {
      result.statusCode = statusCode;
      return response;
    },
    setHeader(name: string, value: string) {
      result.headers[name] = value;
      return response;
    },
  };

  return { response, result };
}

test("job dashboard rejects requests without a Parcelis session", async () => {
  const { prisma, queries } = createPrisma("administrator");
  const { response, result } = createResponse();
  let continued = false;

  await createJobDashboardAuthMiddleware(prisma)({ method: "GET", headers: {} } as never, response as never, () => {
    continued = true;
  });

  assert.equal(result.statusCode, 401);
  assert.equal(queries.length, 0);
  assert.equal(continued, false);
});

test("job dashboard permits active administrators using safe read-only requests", async () => {
  const { prisma, queries } = createPrisma("administrator");
  const { response, result } = createResponse();
  let continued = false;

  await createJobDashboardAuthMiddleware(prisma)(
    { method: "GET", headers: { cookie: "parcelis_session_v2=test-token" } } as never,
    response as never,
    () => {
      continued = true;
    },
  );

  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(queries.length, 1);
  assert.equal(continued, true);
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
    const { response, result } = createResponse();

    await createJobDashboardAuthMiddleware(prisma)(
      { method: "GET", headers: { cookie: "parcelis_session_v2=test-token" } } as never,
      response as never,
      () => assert.fail(`${name} sessions must not reach the dashboard.`),
    );

    assert.equal(result.statusCode, 401);
    assert.equal(queries.length, 1);
  });
}

test("job dashboard permits same-origin writes from active administrators", async () => {
  const { prisma } = createPrisma("administrator");
  const { response, result } = createResponse();
  let continued = false;
  const webOrigin = new URL(process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`).origin;

  await createJobDashboardAuthMiddleware(prisma)(
    { method: "PUT", headers: { cookie: "parcelis_session_v2=test-token", origin: webOrigin } } as never,
    response as never,
    () => {
      continued = true;
    },
  );

  assert.equal(result.headers["Cache-Control"], "private, no-store");
  assert.equal(continued, true);
});

test("job dashboard rejects non-administrators, cross-origin writes, and unsupported methods", async () => {
  const nonAdministrator = createPrisma("property_manager");
  const nonAdminResponse = createResponse();
  await createJobDashboardAuthMiddleware(nonAdministrator.prisma)(
    { method: "GET", headers: { cookie: "parcelis_session_v2=test-token" } } as never,
    nonAdminResponse.response as never,
    () => assert.fail("Non-administrators must not reach the dashboard."),
  );
  assert.equal(nonAdminResponse.result.statusCode, 403);

  const administrator = createPrisma("administrator");
  const writeResponse = createResponse();
  await createJobDashboardAuthMiddleware(administrator.prisma)(
    {
      method: "POST",
      headers: { cookie: "parcelis_session_v2=test-token", origin: "https://attacker.example" },
    } as never,
    writeResponse.response as never,
    () => assert.fail("Cross-origin dashboard writes must be rejected."),
  );
  assert.equal(writeResponse.result.statusCode, 403);

  const unsupportedMethodResponse = createResponse();
  await createJobDashboardAuthMiddleware(administrator.prisma)(
    { method: "OPTIONS", headers: { cookie: "parcelis_session_v2=test-token" } } as never,
    unsupportedMethodResponse.response as never,
    () => assert.fail("Unsupported methods must be rejected."),
  );
  assert.equal(unsupportedMethodResponse.result.statusCode, 405);
});
