import {
  authLoginInputSchema,
  authRegisterInputSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  updateUserProfileInputSchema,
} from "@parcelis/schemas";
import { Prisma } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionExpiration,
  hashPassword,
  hashSessionToken,
  setSessionCookie,
  verifyPassword,
  isAuthenticationDisabled,
} from "../modules/auth";
import {
  clearLoginRateLimit,
  consumeLoginRateLimit,
  getLoginRateLimitKey,
  getPasswordChangeRateLimitKey,
} from "../modules/login-rate-limit";
import { protectedProcedure, publicProcedure, router } from "./trpc";
import type { Context } from "./context";
import { createUserProfileImageDownloadUrl } from "../modules/object-storage.config";

const invalidCredentials = new TRPCError({
  code: "UNAUTHORIZED",
  message: "Invalid email or password.",
});

async function createSession(ctx: Pick<Context, "prisma" | "res">, userId: number) {
  const token = createSessionToken();
  await ctx.prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: getSessionExpiration(),
    },
  });
  setSessionCookie(ctx.res, token);
}

export const authRouter = router({
  register: publicProcedure.input(authRegisterInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getLoginRateLimitKey(ctx.req.ip, input.email);
    consumeLoginRateLimit(rateLimitKey);
    const existingUser = await ctx.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "Unable to create account." });
    }

    let user;
    try {
      const passwordHash = await hashPassword(input.password);
      user = await ctx.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { email: input.email, passwordHash },
          select: { id: true, email: true },
        });
        const organization = await tx.organization.create({
          data: { name: "My organization", slug: `organization-${createdUser.id}` },
          select: { id: true },
        });
        await tx.organizationMembership.create({
          data: { userId: createdUser.id, organizationId: organization.id, role: "owner" },
        });
        await tx.user.update({ where: { id: createdUser.id }, data: { defaultOrganizationId: organization.id } });
        return createdUser;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "Unable to create account." });
      }
      throw error;
    }
    await createSession(ctx, user.id);
    clearLoginRateLimit(rateLimitKey);
    return { user };
  }),

  login: publicProcedure.input(authLoginInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getLoginRateLimitKey(ctx.req.ip, input.email);
    consumeLoginRateLimit(rateLimitKey);
    const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
    const isPasswordValid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await hashPassword(input.password), false);
    if (!user || !isPasswordValid) {
      throw invalidCredentials;
    }
    if (user.accountStatus === "disabled") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "This account has been disabled." });
    }

    await createSession(ctx, user.id);
    clearLoginRateLimit(rateLimitKey);
    return { user: { id: user.id, email: user.email } };
  }),

  changePassword: protectedProcedure.input(changePasswordInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getPasswordChangeRateLimitKey(ctx.req.ip, ctx.user.id);
    consumeLoginRateLimit(rateLimitKey);
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
    }

    const passwordHash = await hashPassword(input.newPassword);
    await ctx.prisma.$transaction([
      ctx.prisma.user.update({ where: { id: ctx.user.id }, data: { passwordHash } }),
      ctx.prisma.session.updateMany({
        where: { userId: ctx.user.id, id: { not: ctx.session.id }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    clearLoginRateLimit(rateLimitKey);
    return { success: true };
  }),

  changeEmail: protectedProcedure.input(changeEmailInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getPasswordChangeRateLimitKey(ctx.req.ip, ctx.user.id);
    consumeLoginRateLimit(rateLimitKey);
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { passwordHash: true },
    });
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
    }

    try {
      const updatedUser = await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { email: input.email },
        select: { email: true },
      });
      clearLoginRateLimit(rateLimitKey);
      return updatedUser;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "An account already uses this email address." });
      }
      throw error;
    }
  }),

  updateProfile: protectedProcedure.input(updateUserProfileInputSchema).mutation(async ({ ctx, input }) => {
    return ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: { name: input.name, phone: input.phone || null },
      select: { id: true, name: true, email: true, phone: true, role: true, accountStatus: true },
    });
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (!isAuthenticationDisabled() && ctx.session) {
      await ctx.prisma.session.update({ where: { id: ctx.session.id }, data: { revokedAt: new Date() } });
    }
    clearSessionCookie(ctx.res);
    return { success: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const { profileImageObjectKey, ...user } = ctx.user;
    return {
      user: { ...user, imageUrl: await createUserProfileImageDownloadUrl(profileImageObjectKey) },
      organizationRole: ctx.organization?.role,
    };
  }),
});
