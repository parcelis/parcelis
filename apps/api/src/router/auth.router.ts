import { sessionStatusSchema } from "@parcelis/schemas";
import { getSessionStatus, renewSession, sessionExpiredMessage } from "../modules/session";
import {
  authLoginInputSchema,
  authRegisterInputSchema,
  changeEmailInputSchema,
  changePasswordInputSchema,
  requestEmailVerificationInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
  updateUserProfileInputSchema,
  verifyEmailInputSchema,
} from "@parcelis/schemas";
import { Prisma } from "@parcelis/db";
import { TRPCError } from "@trpc/server";
import { sendPasswordResetEmail, sendVerificationEmail } from "@parcelis/email";
import {
  clearSessionCookie,
  createEmailVerificationToken,
  createPasswordResetToken,
  createSessionToken,
  getEmailVerificationTokenExpiration,
  getEmailVerificationUrl,
  getLoginTokenUrl,
  getPasswordResetTokenExpiration,
  getSessionExpiration,
  hashEmailVerificationToken,
  hashPassword,
  hashPasswordResetToken,
  hashSessionToken,
  setSessionCookie,
  verifyPassword,
  isAuthenticationDisabled,
} from "../modules/auth";
import { queueNotificationEmailOutboxEvent } from "../modules/notification-outbox";
import {
  clearLoginRateLimit,
  consumeEmailVerificationRateLimit,
  consumeEmailSendRateLimit,
  consumeLoginRateLimit,
  consumePasswordResetRateLimit,
  getLoginRateLimitKey,
  getPasswordChangeRateLimitKey,
  getEmailVerificationRateLimitKey,
  getEmailSendRateLimitKey,
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

const invalidEmailVerificationToken = new TRPCError({
  code: "BAD_REQUEST",
  message: "This email verification link is invalid or has expired.",
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
  session: protectedProcedure.output(sessionStatusSchema).query(({ ctx }) => getSessionStatus(ctx.session)),

  activity: protectedProcedure.output(sessionStatusSchema).mutation(async ({ ctx }) => {
    const status = await renewSession(ctx.prisma, ctx.session.id);
    if (!status) {
      clearSessionCookie(ctx.res);
      throw new TRPCError({ code: "UNAUTHORIZED", message: sessionExpiredMessage });
    }
    return status;
  }),

  register: publicProcedure.input(authRegisterInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getLoginRateLimitKey(ctx.req.ip, input.email);
    consumeLoginRateLimit(rateLimitKey);
    const existingUser = await ctx.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "Unable to create account." });
    }

    consumeEmailSendRateLimit(getEmailSendRateLimitKey(ctx.req.ip));
    let user;
    const verificationToken = createEmailVerificationToken();
    try {
      const passwordHash = await hashPassword(input.password);
      user = await ctx.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: { email: input.email, passwordHash, accountStatus: "pending" },
          select: { id: true, email: true },
        });
        const organization = await tx.organization.create({
          data: { name: "My organization", slug: `organization-${createdUser.id}` },
          select: { id: true },
        });
        await tx.invoiceCharge.create({
          data: {
            organizationId: organization.id,
            name: "Rent",
            description: "Monthly rent for {month} {year}",
            isDefault: true,
          },
        });
        await tx.organizationMembership.create({
          data: { userId: createdUser.id, organizationId: organization.id, role: "owner" },
        });
        await tx.user.update({ where: { id: createdUser.id }, data: { defaultOrganizationId: organization.id } });
        const createdToken = await tx.emailVerificationToken.create({
          data: {
            userId: createdUser.id,
            tokenHash: hashEmailVerificationToken(verificationToken),
            expiresAt: getEmailVerificationTokenExpiration(),
          },
        });
        await queueNotificationEmailOutboxEvent(tx, {
          organizationId: organization.id,
          recipientId: createdUser.id,
          recipientType: "user",
          email: createdUser.email,
          subject: "Verify your Parcelis email",
          body: `Verify your Parcelis email: ${getEmailVerificationUrl(verificationToken)}`,
          template: {
            kind: "account-verification",
            url: getEmailVerificationUrl(verificationToken),
          },
          idempotencyKey: `auth.register:${createdUser.id}:token:${createdToken.id}`,
        });
        return { ...createdUser, organizationId: organization.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "Unable to create account." });
      }
      throw error;
    }
    clearLoginRateLimit(rateLimitKey);
    return { user };
  }),

  verifyEmail: publicProcedure.input(verifyEmailInputSchema).mutation(async ({ ctx, input }) => {
    const tokenHash = hashEmailVerificationToken(input.token);
    const verificationToken = await ctx.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { accountStatus: true } } },
    });
    if (
      !verificationToken ||
      verificationToken.usedAt ||
      verificationToken.expiresAt <= new Date() ||
      verificationToken.user.accountStatus !== "pending"
    ) {
      throw invalidEmailVerificationToken;
    }

    await ctx.prisma.$transaction(async (tx) => {
      const usedAt = new Date();
      const consumedToken = await tx.emailVerificationToken.updateMany({
        where: { id: verificationToken.id, usedAt: null, expiresAt: { gt: usedAt } },
        data: { usedAt },
      });
      if (!consumedToken.count) {
        throw invalidEmailVerificationToken;
      }

      const activatedUser = await tx.user.updateMany({
        where: { id: verificationToken.userId, accountStatus: "pending" },
        data: { accountStatus: "active" },
      });
      if (!activatedUser.count) {
        throw invalidEmailVerificationToken;
      }

      await tx.emailVerificationToken.deleteMany({ where: { userId: verificationToken.userId } });
    });

    return { success: true };
  }),

  requestEmailVerification: publicProcedure
    .input(requestEmailVerificationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = getEmailVerificationRateLimitKey(ctx.req.ip, input.email);
      consumeEmailVerificationRateLimit(rateLimitKey);
      consumeEmailSendRateLimit(getEmailSendRateLimitKey(ctx.req.ip));

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true, email: true, accountStatus: true, defaultOrganizationId: true },
      });
      const token = createEmailVerificationToken();

      if (user?.accountStatus === "pending") {
        void (async () => {
          try {
            let shouldSendDirectly = false;
            await ctx.prisma.$transaction(async (tx) => {
              const now = new Date();
              await tx.emailVerificationToken.deleteMany({
                where: {
                  userId: user.id,
                  OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }],
                },
              });
              const createdToken = await tx.emailVerificationToken.create({
                data: {
                  userId: user.id,
                  tokenHash: hashEmailVerificationToken(token),
                  expiresAt: getEmailVerificationTokenExpiration(),
                },
              });

              if (user.defaultOrganizationId) {
                await queueNotificationEmailOutboxEvent(tx, {
                  organizationId: user.defaultOrganizationId,
                  recipientId: user.id,
                  recipientType: "user",
                  email: user.email,
                  subject: "Verify your Parcelis email",
                  body: `Verify your Parcelis email: ${getEmailVerificationUrl(token)}`,
                  template: { kind: "account-verification", url: getEmailVerificationUrl(token) },
                  idempotencyKey: `auth.request-email-verification:${user.id}:token:${createdToken.id}`,
                });
              } else {
                shouldSendDirectly = true;
              }
            });

            if (shouldSendDirectly) {
              await sendVerificationEmail({
                to: user.email,
                verificationUrl: getEmailVerificationUrl(token),
              });
            }
          } catch (error) {
            console.error("Unable to create email verification token or enqueue notification email.", error);
          }
        })();
      }

      return { success: true };
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
    if (user.accountStatus === "pending") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Please verify your email before signing in." });
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
      select: { id: true, email: true, accountStatus: true, defaultOrganizationId: true },
    });

    const token = createPasswordResetToken();

    if (user?.accountStatus === "active") {
      void (async () => {
        try {
          let shouldSendDirectly = false;

          await ctx.prisma.$transaction(async (tx) => {
          await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
          const createdToken = await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: hashPasswordResetToken(token),
              expiresAt: getPasswordResetTokenExpiration(),
            },
          });

          if (user.defaultOrganizationId) {
            await queueNotificationEmailOutboxEvent(tx, {
              organizationId: user.defaultOrganizationId,
              recipientId: user.id,
              recipientType: "user",
              email: user.email,
              subject: "Reset your Parcelis password",
              body: `Reset your Parcelis password: ${getLoginTokenUrl("reset", token)}`,
              template: { kind: "password-reset", url: getLoginTokenUrl("reset", token) },
              idempotencyKey: `auth.request-password-reset:${user.id}:token:${createdToken.id}`,
            });
            } else {
              shouldSendDirectly = true;
            }
          });

          if (shouldSendDirectly) {
            await sendPasswordResetEmail({
              to: user.email,
              resetUrl: getLoginTokenUrl("reset", token),
            });
          }
        } catch (error) {
          console.error("Unable to create password reset token or enqueue reset email notification.", error);
        }
      })();
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
