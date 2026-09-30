import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sessionExpiredMessage } from "../../modules/session";
import type { Context } from "../../router/context";
import { protectedProcedure, publicProcedure, router } from "../../router/trpc";

const testRouter = router({
  protected: protectedProcedure.query(() => "ok"),
  expired: publicProcedure.query(() => {
    throw new TRPCError({ code: "UNAUTHORIZED", message: sessionExpiredMessage });
  }),
});

async function errorResponse(path: "protected" | "expired") {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: new Request(`http://localhost/trpc/${path}`),
    router: testRouter,
    createContext: () => ({ session: null }) as Context,
  });
  return response.json() as Promise<{ error: { message: string; data: { sessionExpired: boolean } } }>;
}

test("missing sessions do not report expiration", async () => {
  const result = await errorResponse("protected");
  assert.equal(result.error.message, "Please sign in to continue.");
  assert.equal(result.error.data.sessionExpired, false);
});

test("explicit expiration errors retain the expiration flag", async () => {
  const result = await errorResponse("expired");
  assert.equal(result.error.message, sessionExpiredMessage);
  assert.equal(result.error.data.sessionExpired, true);
});
