import { authLoginInputSchema, authRegisterInputSchema } from "@parcelis/schemas";
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
  assertLoginRateLimit,
  clearLoginRateLimit,
  getLoginRateLimitKey,
  recordFailedLogin,
} from "../modules/login-rate-limit";
import { protectedProcedure, publicProcedure, router } from "./trpc";
import type { Context } from "./context";

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
    assertLoginRateLimit(rateLimitKey);
    const existingUser = await ctx.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existingUser) {
      recordFailedLogin(rateLimitKey);
      throw new TRPCError({ code: "CONFLICT", message: "Unable to create account." });
    }

    const user = await ctx.prisma.user.create({
      data: { email: input.email, passwordHash: await hashPassword(input.password) },
      select: { id: true, email: true },
    });
    await createSession(ctx, user.id);
    clearLoginRateLimit(rateLimitKey);
    return { user };
  }),

  login: publicProcedure.input(authLoginInputSchema).mutation(async ({ ctx, input }) => {
    const rateLimitKey = getLoginRateLimitKey(ctx.req.ip, input.email);
    assertLoginRateLimit(rateLimitKey);
    const user = await ctx.prisma.user.findUnique({ where: { email: input.email } });
    const isPasswordValid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await hashPassword(input.password), false);
    if (!user || !isPasswordValid) {
      recordFailedLogin(rateLimitKey);
      throw invalidCredentials;
    }

    await createSession(ctx, user.id);
    clearLoginRateLimit(rateLimitKey);
    return { user: { id: user.id, email: user.email } };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (!isAuthenticationDisabled() && ctx.session) {
      await ctx.prisma.session.update({ where: { id: ctx.session.id }, data: { revokedAt: new Date() } });
    }
    clearSessionCookie(ctx.res);
    return { success: true };
  }),

  me: protectedProcedure.query(({ ctx }) => ({ user: ctx.user })),
});
