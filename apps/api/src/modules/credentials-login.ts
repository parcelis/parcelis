import type { PrismaClient } from "@parcelis/db";
import { authLoginInputSchema } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import { createSessionToken, getSessionExpiration, hashPassword, hashSessionToken, verifyPassword } from "./auth";
import { clearLoginRateLimit, consumeLoginRateLimit, getLoginRateLimitKey } from "./login-rate-limit";

export async function loginWithCredentials(prisma: PrismaClient, credentials: unknown, ip?: string) {
  const input = authLoginInputSchema.parse(credentials);
  const rateLimitKey = getLoginRateLimitKey(ip, input.email);
  consumeLoginRateLimit(rateLimitKey);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const isPasswordValid = user
    ? await verifyPassword(user.passwordHash, input.password)
    : (await hashPassword(input.password), false);
  if (!user || !isPasswordValid) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
  }
  if (user.accountStatus === "pending") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please verify your email before signing in." });
  }
  if (user.accountStatus === "disabled") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "This account has been disabled." });
  }

  const token = createSessionToken();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: getSessionExpiration() },
  });
  clearLoginRateLimit(rateLimitKey);
  return { user: { id: user.id, email: user.email }, token };
}
