import { Prisma } from "@parcelis/db";
import { updateApiTokenLastUsed } from "../modules/api-tokens";
import { withActivityActor } from "../modules/activity-actor";
import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import type { OpenApiMeta } from "trpc-to-openapi";
import type { Context } from "./context";

const t = initTRPC.context<Context>().meta<OpenApiMeta>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const apiTokenAllowedProcedures = new Set([
  "properties.list",
  "properties.byId",
  "properties.create",
  "properties.update",
  "properties.createImageUploadUrl",
  "properties.completeImageUpload",
  "properties.deleteImage",
  "properties.archive",
  "properties.inactivate",
  "properties.reactivate",
  "properties.delete",
  "properties.updateNotes",
  "tenants.createImageUploadUrl",
  "tenants.completeImageUpload",
  "tenants.deleteImage",
  "tags.list",
  "tags.create",
  "unitOptions.list",
  "amenities.list",
  "amenities.update",
  "units.list",
  "units.byId",
  "units.create",
  "units.update",
  "units.delete",
]);
export const authenticatedProcedure = t.procedure.use(({ ctx, next, path }) => {
  const principal = ctx.session ? { kind: "user" as const, userId: ctx.session.userId } : ctx.principal;

  if (!principal || (principal.kind === "api-token" && ctx.transport !== "rest")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  }
  if (principal.kind === "api-token" && !apiTokenAllowedProcedures.has(path)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "API tokens cannot access this operation.",
    });
  }

  return next({ ctx: { ...ctx, principal } });
});
export const organizationApiProcedure = authenticatedProcedure.use(async ({ ctx, next }) => {
  const organizationScope =
    ctx.principal.kind === "api-token"
      ? {
          organizationId: ctx.principal.organizationId,
          organization: ctx.principal.organization,
        }
      : ctx.organization
        ? {
            organizationId: ctx.organization.organizationId,
            organization: ctx.organization.organization,
          }
        : null;

  if (!organizationScope) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Organization access is required.",
    });
  }

  if (ctx.principal.kind === "api-token") {
    void updateApiTokenLastUsed(ctx.prisma, ctx.principal.tokenId).catch(() => {
      console.error("API-token last-used update failed.");
    });
  }

  const proceed = () => next({ ctx: { ...ctx, organizationScope } });
  const result = await (ctx.principal.kind === "api-token"
    ? withActivityActor(
        { id: `api-token:${ctx.principal.tokenId}`, name: `API token: ${ctx.principal.tokenName}` },
        proceed,
      )
    : proceed());
  if (
    !result.ok &&
    ctx.transport === "rest" &&
    result.error.cause instanceof Prisma.PrismaClientKnownRequestError &&
    result.error.cause.code === "P2025"
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Record not found." });
  }
  return result;
});
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const session = ctx.session;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to continue." });
  return next({ ctx: { ...ctx, session, user: session.user } });
});

export const organizationProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.organization) throw new TRPCError({ code: "FORBIDDEN", message: "Organization access is required." });
  return next({ ctx: { ...ctx, organization: ctx.organization } });
});
