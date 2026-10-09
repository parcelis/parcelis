import type { PrismaClient } from "@parcelis/db";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { TRPCError } from "@trpc/server";
import { authLoginInputSchema } from "@parcelis/schemas";
import { hashPassword, verifyPassword } from "./auth";
import { clearLoginRateLimit, consumeLoginRateLimit, getLoginRateLimitKey } from "./login-rate-limit";
import { getNextAuthConfiguration } from "./nextauth-config";
import { getClientIp } from "../router/fetch-context";

const sessionMaxAge = 7 * 24 * 60 * 60;

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

  clearLoginRateLimit(rateLimitKey);
  return { id: String(user.id), name: user.name, email: user.email };
}

export function createNextAuthOptions(prisma: PrismaClient, { secret } = getNextAuthConfiguration()): NextAuthOptions {
  return {
    secret,
    session: { strategy: "jwt", maxAge: sessionMaxAge },
    jwt: { maxAge: sessionMaxAge },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      CredentialsProvider({
        name: "Email and password",
        credentials: { email: { type: "email" }, password: { type: "password" } },
        async authorize(credentials, request) {
          try {
            const headers = new Headers();
            const forwardedFor = request.headers?.["x-forwarded-for"];
            if (typeof forwardedFor === "string") headers.set("x-forwarded-for", forwardedFor);
            const ip = getClientIp(new Request("http://localhost", { headers }));
            return await loginWithCredentials(prisma, credentials, ip);
          } catch (error) {
            if (error instanceof TRPCError) throw new Error(error.message);
            throw new Error("Unable to sign in. Please try again.");
          }
        },
      }),
    ],
    callbacks: {
      async session({ session, token }) {
        const id = Number(token.sub);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid session.");
        const user = await prisma.user.findUnique({
          where: { id },
          select: { name: true, email: true, accountStatus: true },
        });
        if (!user || user.accountStatus !== "active") throw new Error("Please sign in again.");
        session.user = { name: user.name, email: user.email };
        return session;
      },
    },
  };
}
