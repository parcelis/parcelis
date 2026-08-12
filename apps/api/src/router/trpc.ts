import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import type { Context } from "./context";

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const session = ctx.session;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in is required to complete this action." });
  return next({ ctx: { ...ctx, session, user: session.user } });
});
