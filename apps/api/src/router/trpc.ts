import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import { isAuthenticationDisabled } from "../modules/auth";
import type { Context } from "./context";

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (isAuthenticationDisabled()) {
    const now = new Date();
    return next({
      ctx: {
        ...ctx,
        session: {
          id: 0,
          userId: 0,
          tokenHash: "",
          expiresAt: now,
          revokedAt: null,
          createdAt: now,
          lastSeenAt: now,
          user: { id: 0, email: "development@parcelis.dev", role: "administrator", accountStatus: "active" },
        },
        user: { id: 0, email: "development@parcelis.dev", role: "administrator", accountStatus: "active" },
      },
    });
  }
  const session = ctx.session;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session, user: session.user } });
});
