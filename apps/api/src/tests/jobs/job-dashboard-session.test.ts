import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { Hono } from "hono";
import { createTestSessionCookie } from "../auth/session-cookie";
import { createJobDashboardHandler } from "../../modules/job-dashboard";

test("job dashboard rejects requests without a JWT before database access", async () => {
  const response = await createJobDashboardHandler({} as PrismaClient, () => {
    assert.fail("Unauthenticated request reached dashboard");
  })(new Request("http://localhost/admin/jobs/"));
  assert.equal(response.status, 401);
});

for (const [role, accountStatus, expected] of [
  ["administrator", "active", 200],
  ["property_manager", "active", 403],
  ["administrator", "disabled", 401],
] as const) {
  test("job dashboard enforces current account and role: " + role + "/" + accountStatus, async () => {
    const prisma = { user: { findUnique: async () => ({ id: 7, role, accountStatus }) } } as unknown as PrismaClient;
    const app = new Hono().get("/admin/jobs/", (c) => c.text("ready"));
    const response = await createJobDashboardHandler(
      prisma,
      () => app,
    )(new Request("http://localhost/admin/jobs/", { headers: { cookie: await createTestSessionCookie() } }));
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });
}
