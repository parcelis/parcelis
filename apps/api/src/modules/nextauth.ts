import type { PrismaClient } from "@parcelis/db";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { TRPCError } from "@trpc/server";
import { getCookieOptions, hashSessionToken } from "./auth";
import { loginWithCredentials } from "./credentials-login";
import { getNextAuthConfiguration, nextAuthCookieName, nextAuthSessionMaxAge } from "./nextauth-token";
import { getSessionStatus, validSessionWhere } from "./session";
import { getClientIp } from "../router/fetch-context";

declare module "next-auth" {
  interface User {
    sessionToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionToken?: string;
  }
}

export function createNextAuthOptions(
  prisma: PrismaClient,
  { secret, origin } = getNextAuthConfiguration(),
): NextAuthOptions {
  return {
    secret,
    session: { strategy: "jwt", maxAge: nextAuthSessionMaxAge },
    pages: { signIn: "/login", error: "/login" },
    cookies: { sessionToken: { name: nextAuthCookieName, options: getCookieOptions() } },
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
            const { user, token } = await loginWithCredentials(prisma, credentials, ip);
            return { id: String(user.id), email: user.email, sessionToken: token };
          } catch (error) {
            if (error instanceof TRPCError) throw new Error(error.message);
            throw new Error("Unable to sign in. Please try again.");
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) token.sessionToken = user.sessionToken;
        const session =
          typeof token.sessionToken === "string"
            ? await prisma.session.findFirst({
                where: { tokenHash: hashSessionToken(token.sessionToken), ...validSessionWhere(new Date()) },
              })
            : null;
        if (!session) throw new Error("Your session has expired. Please sign in again.");
        return token;
      },
      async session({ session, token }) {
        if (typeof token.sessionToken !== "string") throw new Error("Invalid session.");
        const record = await prisma.session.findFirst({
          where: { tokenHash: hashSessionToken(token.sessionToken), ...validSessionWhere(new Date()) },
          include: { user: { select: { name: true, email: true } } },
        });
        if (!record) throw new Error("Your session has expired. Please sign in again.");
        session.user = { name: record.user.name, email: record.user.email };
        session.expires = new Date(getSessionStatus(record).expiresAt).toISOString();
        return session;
      },
      async redirect({ url }) {
        if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return `${origin}${url}`;
        try {
          if (new URL(url).origin === origin) return url;
        } catch {
          return origin;
        }
        return origin;
      },
    },
    events: {
      async signOut({ token }) {
        if (typeof token?.sessionToken === "string") {
          await prisma.session.updateMany({
            where: { tokenHash: hashSessionToken(token.sessionToken), revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      },
    },
  };
}
