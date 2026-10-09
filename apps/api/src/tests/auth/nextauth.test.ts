import assert from "node:assert/strict";
import test from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";
import { decode, encode } from "next-auth/jwt";
import type { PrismaClient } from "@parcelis/db";
import { hashPassword } from "../../modules/auth";
import { resetRateLimits } from "../../modules/login-rate-limit";
import { createContext } from "../../router/context";
import { createNextAuthOptions } from "../../modules/nextauth";
import { nextAuthCookieName } from "./session-cookie";
import { readSession } from "../../modules/session";

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
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: number } }) =>
        where.email === user.email || where.id === user.id ? user : null,
    },
    organizationMembership: {
      findFirst: async () => ({ organizationId: 3, role: "owner", organization: { id: 3, slug: "portfolio" } }),
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
  return { prisma, user, cookies, request, signIn, sessionRequest };
}

test("NextAuth requires CSRF and authenticates existing Argon2 passwords using JWTs", async () => {
  const state = await fixture();
  await state.request("callback/credentials", "POST", { email: state.user.email, password, json: "true" });
  assert.equal(state.cookies[nextAuthCookieName], undefined);
  const result = await state.signIn();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { url: "http://localhost:30000/" });
  const jwt = await decode({ token: state.cookies[nextAuthCookieName], secret: process.env.NEXTAUTH_SECRET! });
  assert.equal(jwt?.sub, String(state.user.id));
  assert.equal(jwt?.sessionToken, undefined);
  assert.equal((await readSession(state.prisma, state.sessionRequest()))?.userId, state.user.id);
  const session = await state.request("session");
  assert.deepEqual((session.body as { user: unknown }).user, { name: state.user.name, email: state.user.email });
  assert.ok(!JSON.stringify(session.body).includes("passwordHash"));
});

test("NextAuth signout requires CSRF and clears the browser cookie", async () => {
  const state = await fixture();
  await state.signIn();
  const captured = state.sessionRequest();
  await state.request("signout", "POST", { json: "true" });
  assert.ok(state.cookies[nextAuthCookieName]);
  const csrf = await state.request("csrf");
  await state.request("signout", "POST", { csrfToken: (csrf.body as { csrfToken: string }).csrfToken, json: "true" });
  assert.equal(state.cookies[nextAuthCookieName], undefined);
  assert.equal(await readSession(state.prisma, state.sessionRequest()), null);
  assert.ok(await readSession(state.prisma, captured));
});

test("disabled users lose access to NextAuth sessions and API requests", async (t) => {
  t.mock.method(console, "error", () => {});
  const state = await fixture();
  await state.signIn();
  state.user.accountStatus = "disabled";
  assert.equal(await readSession(state.prisma, state.sessionRequest()), null);
  assert.deepEqual((await state.request("session")).body, {});
});

test("legacy cookies and tampered JWTs cannot authenticate", async () => {
  const state = await fixture();
  state.cookies.parcelis_session_v2 = "legacy-token";
  assert.equal(await readSession(state.prisma, state.sessionRequest()), null);
  state.cookies[nextAuthCookieName] = "tampered";
  assert.equal(await readSession(state.prisma, state.sessionRequest()), null);
});

test("NextAuth decodes chunked cookies and clears them on sign-out", async () => {
  const state = await fixture();
  const token = await encode({ token: { sub: "7" }, secret: process.env.NEXTAUTH_SECRET! });
  state.cookies[nextAuthCookieName + ".1"] = token.slice(100);
  state.cookies[nextAuthCookieName + ".0"] = token.slice(0, 100);
  assert.equal((await readSession(state.prisma, state.sessionRequest()))?.userId, 7);
  const csrf = await state.request("csrf");
  await state.request("signout", "POST", { csrfToken: (csrf.body as { csrfToken: string }).csrfToken, json: "true" });
  assert.equal(state.cookies[nextAuthCookieName + ".0"], undefined);
  assert.equal(state.cookies[nextAuthCookieName + ".1"], undefined);
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
  assert.equal(state.cookies[nextAuthCookieName], undefined);
});

test("NextAuth sessions retain organization context", async () => {
  const state = await fixture();
  await state.signIn();
  const context = await createContext(state.prisma)({ req: state.sessionRequest() });
  assert.equal(context.session?.userId, state.user.id);
  assert.equal(context.organization?.organizationId, 3);
  assert.equal(context.session?.user.id, state.user.id);
});

test("NextAuth renews the seven-day JWT lifetime through its session endpoint", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  const state = await fixture();
  await state.signIn();
  const initial = await decode({ token: state.cookies[nextAuthCookieName], secret: process.env.NEXTAUTH_SECRET! });
  assert.equal(Number(initial?.exp) - Number(initial?.iat), 604_800);
  t.mock.timers.setTime(now + 86_400_000);
  await state.request("session");
  const renewed = await decode({ token: state.cookies[nextAuthCookieName], secret: process.env.NEXTAUTH_SECRET! });
  assert.equal(Number(renewed?.exp) - Number(initial?.exp), 86_400);
});

for (const protocol of ["http", "https"]) {
  test("NextAuth chooses its default cookie for " + protocol, async (t) => {
    const previous = process.env.NEXTAUTH_URL;
    t.after(() => {
      process.env.NEXTAUTH_URL = previous;
    });
    process.env.NEXTAUTH_URL = protocol + "://localhost:30000";
    const state = await fixture();
    const response = await state.signIn();
    const name = protocol === "https" ? "__Secure-next-auth.session-token" : "next-auth.session-token";
    assert.ok(state.cookies[name]);
    const header = response.headers.get("set-cookie")!;
    const cookie = (Array.isArray(header) ? header : [header]).find((value) => value.startsWith(name + "="))!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/i);
    assert.equal(/; Secure/i.test(cookie), protocol === "https");
    assert.equal(/; Domain=/i.test(cookie), false);
    assert.equal((await readSession(state.prisma, state.sessionRequest()))?.userId, 7);
  });
}
