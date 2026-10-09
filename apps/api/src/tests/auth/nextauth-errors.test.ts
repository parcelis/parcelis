import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@parcelis/db";
import { authenticationUnavailableMessage } from "@parcelis/schemas";
import { GET, POST } from "../../app/api/auth/[...nextauth]/route";
import { nextAuthCookieName } from "./session-cookie";
import { readSession } from "../../modules/session";

for (const secret of [undefined, "", "   "]) {
  test(`missing NextAuth secret (${JSON.stringify(secret)}) returns a useful error without signing in`, async (t) => {
    const original = process.env.NEXTAUTH_SECRET;
    t.after(() => {
      if (original === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = original;
    });
    t.mock.method(console, "error", () => {});
    if (secret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = secret;

    for (const action of ["providers", "callback/credentials"]) {
      const method = action === "providers" ? "GET" : "POST";
      const handler = method === "GET" ? GET : POST;
      const response = await handler(new NextRequest(`http://localhost/api/auth/${action}`, { method }), {
        params: Promise.resolve({ nextauth: action.split("/") }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: authenticationUnavailableMessage });
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("set-cookie"), null);
    }

    const session = await readSession({} as PrismaClient, {
      headers: { cookie: `${nextAuthCookieName}=old-cookie; parcelis_session_v2=legacy-cookie` },
    });
    assert.equal(session, null);
  });
}

test("the NextAuth error URL returns users to the login page", async () => {
  const response = await GET(new NextRequest("http://localhost/api/auth/error"), {
    params: Promise.resolve({ nextauth: ["error"] }),
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login?error=Configuration");
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
