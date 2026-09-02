import {
  authLoginInputSchema,
  authRegisterInputSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
  updateUserProfileInputSchema,
} from "@parcelis/schemas";
import { Prisma } from "@parcelis/db";
import { sendPasswordResetEmail } from "@parcelis/email";
import { TRPCError } from "@trpc/server";
import {
  clearSessionCookie,
  createPasswordResetToken,
  createSessionToken,
  getPasswordResetTokenExpiration,
  getSessionExpiration,
  hashPassword,
  hashPasswordResetToken,
  hashSessionToken,
  setSessionCookie,
  verifyPassword,
  isAuthenticationDisabled,
} from "../modules/auth";
import {
  clearLoginRateLimit,
  consumeLoginRateLimit,
  consumePasswordResetRateLimit,
  getLoginRateLimitKey,
  getPasswordChangeRateLimitKey,
  getPasswordResetRateLimitKey,
} from "../modules/login-rate-limit";
import { protectedProcedure, publicProcedure, router } from "./trpc";
import type { Context } from "./context";
import { createUserProfileImageDownloadUrl } from "../modules/object-storage.config";
import { getRolePermissions } from "../modules/permissions";

const invalidCredentials = new TRPCError({
  code: "UNAUTHORIZED",
  message: "Invalid email or password.",
});

const invalidPasswordResetToken = new TRPCError({
  code: "BAD_REQUEST",
  message: "This password reset link is invalid or has expired.",
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

function getPasswordResetUrl(token: string) {
  const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;
  const resetUrl = new URL("/login", webOrigin);
  resetUrl.searchParams.set("mode", "reset");
  resetUrl.hash = new URLSearchParams({ token }).toString();
  return resetUrl.toString();
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

  requestPasswordReset: publicProcedure.input(requestPasswordResetInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getPasswordResetRateLimitKey(ctx.req.ip, input.email);
    consumePasswordResetRateLimit(rateLimitKey);

    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, accountStatus: true },
    });

    const token = createPasswordResetToken();

    if (user?.accountStatus === "active") {
      void ctx.prisma
        .$transaction(async (tx) => {
          await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
          await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashPasswordResetToken(token),
              expiresAt: getPasswordResetTokenExpiration(),
            },
          });
        })
        .then(() => sendPasswordResetEmail({ resetUrl: getPasswordResetUrl(token), to: user.email }))
        .catch((error: unknown) => {
          console.error("Unable to create password reset token or send reset email.", error);
        });
    }

    return { success: true };
  }),

  resetPassword: publicProcedure.input(resetPasswordInputSchema).mutation(async ({ ctx, input }) => {
    const tokenHash = hashPasswordResetToken(input.token);
    const passwordResetToken = await ctx.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { accountStatus: true } } },
    });
    if (
      !passwordResetToken ||
      passwordResetToken.usedAt ||
      passwordResetToken.expiresAt <= new Date() ||
      passwordResetToken.user.accountStatus !== "active"
    ) {
      throw invalidPasswordResetToken;
    }

    const passwordHash = await hashPassword(input.password);
    await ctx.prisma.$transaction(async (tx) => {
      const usedAt = new Date();
      const consumedToken = await tx.passwordResetToken.updateMany({
        where: { id: passwordResetToken.id, usedAt: null, expiresAt: { gt: usedAt } },
        data: { usedAt },
      });
      if (!consumedToken.count) {
        throw invalidPasswordResetToken;
      }

      const updatedUser = await tx.user.updateMany({
        where: { id: passwordResetToken.userId, accountStatus: "active" },
        data: { passwordHash },
      });
      if (!updatedUser.count) {
        throw invalidPasswordResetToken;
      }

      await tx.session.updateMany({
        where: { userId: passwordResetToken.userId, revokedAt: null },
        data: { revokedAt: usedAt },
      });
    });

    clearSessionCookie(ctx.res);
    return { success: true };
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
      permissions: await getRolePermissions(ctx.prisma, ctx.user.role),
    };
  }),
});
