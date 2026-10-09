import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";
import { decode, encode } from "next-auth/jwt";
import type { Prisma, PrismaClient } from "@parcelis/db";
import { clearSessionCookie, hashPassword, hashSessionToken } from "../../modules/auth";
import { loginWithCredentials } from "../../modules/credentials-login";
import { resetRateLimits } from "../../modules/login-rate-limit";
import { createContext } from "../../router/context";
import { authRouter } from "../../router/auth.router";
import { createNextAuthOptions } from "../../modules/nextauth";
import { nextAuthCookieName, readNextAuthToken } from "../../modules/nextauth-token";
import { getSessionStatus, readSession } from "../../modules/session";

process.env.NEXTAUTH_SECRET = "nextauth-test-secret-not-for-production";
process.env.NEXTAUTH_URL = "http://localhost:30000";
const password = "Parcelis-password-123!";
const passwordHash = hashPassword(password);

async function fixture() {
  resetRateLimits();
  const user = {
    id: 7,
    name: "Owner",
    email: "owner@example.com",
    passwordHash: await passwordHash,
    accountStatus: "active",
    role: "property_manager",
    defaultOrganizationId: 3,
  };
  const sessions: Array<{
    id: number;
    userId: number;
    tokenHash: string;
    expiresAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
    user: typeof user;
  }> = [];
  function matches(session: (typeof sessions)[number], where: Prisma.SessionWhereInput) {
    return (
      session.tokenHash === where.tokenHash &&
      (!where.expiresAt || session.expiresAt > (where.expiresAt as { gt: Date }).gt) &&
      (where.revokedAt !== null || session.revokedAt === null) &&
      (!where.lastSeenAt || session.lastSeenAt > (where.lastSeenAt as { gt: Date }).gt) &&
      (!where.user || user.accountStatus === "active")
    );
  }
  const prisma = {
    user: { findUnique: async ({ where }: { where: { email: string } }) => (where.email === user.email ? user : null) },
    organizationMembership: {
      findFirst: async () => ({ organizationId: 3, role: "owner", organization: { id: 3, slug: "portfolio" } }),
    },
    session: {
      update: async ({ where, data }: { where: { id: number }; data: { revokedAt: Date } }) => {
        const record = sessions.find((session) => session.id === where.id)!;
        record.revokedAt = data.revokedAt;
        return record;
      },
      create: async ({ data }: { data: { userId: number; tokenHash: string; expiresAt: Date } }) => {
        const session = { ...data, id: sessions.length + 1, lastSeenAt: new Date(), revokedAt: null, user };
        sessions.push(session);
        return session;
      },
      findFirst: async ({ where }: { where: Prisma.SessionWhereInput }) =>
        sessions.find((session) => matches(session, where)) ?? null,
      updateMany: async ({ where, data }: { where: Prisma.SessionWhereInput; data: { revokedAt: Date } }) => {
        const matched = sessions.filter((session) => matches(session, where));
        for (const session of matched) session.revokedAt = data.revokedAt;
        return { count: matched.length };
      },
    },
  } as unknown as PrismaClient;
  const cookies: Record<string, string> = {};
  async function request(action: string, method = "GET", body?: Record<string, string>) {
    const headers = new Map<string, string | string[]>();
    let responseBody: unknown;
    let status = 200;
    const response = {
      status(value: number) {
        status = value;
        return response;
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase());
      },
      setHeader(name: string, value: string | string[]) {
        headers.set(name.toLowerCase(), value);
        return response;
      },
      end() {
        return response;
      },
      send(value: unknown) {
        responseBody = value;
        return response;
      },
      json(value: unknown) {
        responseBody = value;
        return response;
      },
    };
    await NextAuth(
      {
        method,
        query: { nextauth: action.split("/") },
        headers: { host: "localhost:30000" },
        cookies: { ...cookies },
        body,
      } as unknown as NextApiRequest,
      response as unknown as NextApiResponse,
      createNextAuthOptions(prisma),
    );
    const setCookie = headers.get("set-cookie") ?? [];
    for (const cookie of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      const pair = cookie.split(";", 1)[0]!;
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      const value = decodeURIComponent(pair.slice(index + 1));
      if (value) cookies[name] = value;
      else delete cookies[name];
    }
    return { status, body: responseBody, headers };
  }
  async function signIn(credentials = { email: user.email, password }) {
    const csrf = await request("csrf");
    const { csrfToken } = csrf.body as { csrfToken: string };
    return request("callback/credentials", "POST", { ...credentials, csrfToken, json: "true", callbackUrl: "/" });
  }
  const sessionRequest = () => ({
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
  const cleared: string[] = [];
  const sessionResponse = {
    cookie() {},
    clearCookie(name: string) {
      cleared.push(name);
    },
  };
  return { prisma, user, sessions, cookies, request, signIn, sessionRequest, sessionResponse, cleared };
}

test("NextAuth requires CSRF and authenticates existing Argon2 passwords with a database session", async () => {
  const state = await fixture();
  await state.request("callback/credentials", "POST", { email: state.user.email, password, json: "true" });
  assert.equal(state.sessions.length, 0);
  const result = await state.signIn();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { url: "http://localhost:30000/" });
  assert.ok(state.cookies[nextAuthCookieName]);
  assert.equal(state.cookies.parcelis_session_v2, undefined);
  const jwt = await decode({ token: state.cookies[nextAuthCookieName], secret: process.env.NEXTAUTH_SECRET! });
  assert.equal(hashSessionToken(jwt!.sessionToken!), state.sessions[0]!.tokenHash);
  assert.equal((await readSession(state.prisma, state.sessionRequest(), state.sessionResponse))?.userId, state.user.id);
  const initialActivity = state.sessions[0]!.lastSeenAt.getTime();
  const session = await state.request("session");
  assert.deepEqual(session.body, {
    user: { name: state.user.name, email: state.user.email },
    expires: new Date(getSessionStatus(state.sessions[0]!).expiresAt).toISOString(),
  });
  assert.equal(state.sessions[0]!.lastSeenAt.getTime(), initialActivity);
  assert.ok(!JSON.stringify(session.body).includes(jwt!.sessionToken!));
});

test("NextAuth signout revokes the database session", async () => {
  const state = await fixture();
  await state.signIn();
  const captured = state.sessionRequest();
  await state.request("signout", "POST", { json: "true" });
  assert.equal(state.sessions[0]!.revokedAt, null);
  assert.ok(state.cookies[nextAuthCookieName]);
  const csrf = await state.request("csrf");
  await state.request("signout", "POST", { csrfToken: (csrf.body as { csrfToken: string }).csrfToken, json: "true" });
  assert.ok(state.sessions[0]!.revokedAt);
  assert.equal(state.cookies[nextAuthCookieName], undefined);
  assert.equal(await readSession(state.prisma, captured, state.sessionResponse), null);
});

for (const invalid of ["idle", "expired", "revoked", "disabled"] as const) {
  test(`NextAuth and API requests reject ${invalid} sessions without renewing them`, async (t) => {
    t.mock.method(console, "error", () => {});
    const state = await fixture();
    await state.signIn();
    const record = state.sessions[0]!;
    if (invalid === "idle") record.lastSeenAt = new Date(Date.now() - 16 * 60_000);
    if (invalid === "expired") record.expiresAt = new Date(0);
    if (invalid === "revoked") record.revokedAt = new Date();
    if (invalid === "disabled") state.user.accountStatus = "disabled";
    assert.equal(await readSession(state.prisma, state.sessionRequest(), state.sessionResponse), null);
    assert.deepEqual((await state.request("session")).body, {});
    assert.ok(state.cleared.includes(nextAuthCookieName));
  });
}

test("invalid NextAuth cookies cannot fall back to a valid legacy session", async () => {
  const state = await fixture();
  const legacy = await loginWithCredentials(state.prisma, { email: state.user.email, password });
  state.cookies.parcelis_session_v2 = legacy.token;
  assert.ok(await readSession(state.prisma, state.sessionRequest(), state.sessionResponse));
  state.cookies[nextAuthCookieName] = "tampered";
  assert.equal(await readSession(state.prisma, state.sessionRequest(), state.sessionResponse), null);
});

test("chunked NextAuth cookies are decoded in numeric order and all cleared on logout", async () => {
  const token = await encode({ token: { sessionToken: "opaque-token" }, secret: process.env.NEXTAUTH_SECRET! });
  const request = {
    headers: { cookie: `${nextAuthCookieName}.1=${token.slice(100)}; ${nextAuthCookieName}.0=${token.slice(0, 100)}` },
  };
  assert.deepEqual(await readNextAuthToken(request), { present: true, token: "opaque-token" });
  const cleared: string[] = [];
  clearSessionCookie(
    {
      cookie() {},
      clearCookie(name) {
        cleared.push(name);
      },
    },
    request,
  );
  assert.deepEqual(
    new Set(cleared),
    new Set(["parcelis_session_v2", nextAuthCookieName, `${nextAuthCookieName}.0`, `${nextAuthCookieName}.1`]),
  );
});

test("NextAuth preserves account-status errors and login throttling", async () => {
  const state = await fixture();
  state.user.accountStatus = "pending";
  assert.match(JSON.stringify((await state.signIn()).body), /Please.*verify.*email/);
  state.user.accountStatus = "disabled";
  assert.match(JSON.stringify((await state.signIn()).body), /disabled/);
  state.user.accountStatus = "active";
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.match(
      JSON.stringify((await state.signIn({ email: state.user.email, password: "wrong-password-123" })).body),
      /Invalid.*email.*password/,
    );
  }
  assert.match(JSON.stringify((await state.signIn()).body), /Too.*many.*attempts/);
  assert.equal(state.sessions.length, 0);
});

test("NextAuth sessions retain organization context and transitional API logout revokes them", async () => {
  const state = await fixture();
  await state.signIn();
  const context = await createContext(state.prisma)({ req: state.sessionRequest(), res: state.sessionResponse });
  assert.equal(context.session?.userId, state.user.id);
  assert.equal(context.organization?.organizationId, 3);
  await authRouter.createCaller(context).logout();
  assert.ok(state.sessions[0]!.revokedAt);
  assert.ok(state.cleared.includes(nextAuthCookieName));
  assert.ok(state.cleared.includes("parcelis_session_v2"));
  assert.equal(await readSession(state.prisma, state.sessionRequest(), state.sessionResponse), null);
});
