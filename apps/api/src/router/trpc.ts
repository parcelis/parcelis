import { sessionExpiredMessage } from "../modules/session";
import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import type { Context } from "./context";

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        sessionExpired: error.code === "UNAUTHORIZED" && error.message === sessionExpiredMessage,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const session = ctx.session;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  return next({ ctx: { ...ctx, session, user: session.user } });
});

export const organizationProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.organization) throw new TRPCError({ code: "FORBIDDEN", message: "Organization access is required." });
  return next({ ctx: { ...ctx, organization: ctx.organization } });
});
