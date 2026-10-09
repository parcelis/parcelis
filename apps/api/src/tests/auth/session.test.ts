import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "next-auth/jwt";
import type { PrismaClient } from "@parcelis/db";
import { readSession } from "../../modules/session";
import { nextAuthCookieName } from "./session-cookie";
import { createTestSessionCookie } from "./session-cookie";

test("valid JWTs resolve current users without a database session", async () => {
  const user = { id: 7, accountStatus: "active" };
  const prisma = { user: { findUnique: async () => user } } as unknown as PrismaClient;
  assert.deepEqual(await readSession(prisma, { headers: { cookie: await createTestSessionCookie() } }), {
    userId: 7,
    user,
  });
});

for (const status of ["disabled", "pending", null]) {
  test("JWT access rejects account status " + status, async () => {
    const prisma = {
      user: { findUnique: async () => (status ? { id: 7, accountStatus: status } : null) },
    } as unknown as PrismaClient;
    assert.equal(await readSession(prisma, { headers: { cookie: await createTestSessionCookie() } }), null);
  });
}

test("expired and malformed JWTs are rejected before database access", async () => {
  await createTestSessionCookie();
  const expired = await encode({ token: { sub: "7" }, secret: process.env.NEXTAUTH_SECRET!, maxAge: -60 });
  for (const token of [expired, "tampered"]) {
    assert.equal(
      await readSession({} as PrismaClient, { headers: { cookie: nextAuthCookieName + "=" + token } }),
      null,
    );
  }
});

test("HTTPS test fixtures use NextAuth's secure session-cookie name", async (t) => {
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  t.after(() => {
    process.env.NEXTAUTH_URL = previousNextAuthUrl;
  });
  process.env.NEXTAUTH_URL = "https://localhost:30000";

  const cookie = await createTestSessionCookie();
  const prisma = {
    user: { findUnique: async () => ({ id: 7, accountStatus: "active" }) },
  } as unknown as PrismaClient;

  assert.match(cookie, /^__Secure-next-auth\.session-token=/);
  assert.equal((await readSession(prisma, { headers: { cookie } }))?.userId, 7);
});
