import { encode } from "next-auth/jwt";

process.env.NEXTAUTH_URL ||= "http://localhost:30000";
process.env.NEXTAUTH_SECRET ||= "nextauth-session-fixture-secret-not-for-production";

function getNextAuthCookieName() {
  const secureCookie = process.env.NEXTAUTH_URL?.startsWith("https://") ?? Boolean(process.env.VERCEL);
  return secureCookie ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export const nextAuthCookieName = getNextAuthCookieName();

export async function createTestSessionCookie(userId = "7") {
  const jwt = await encode({ token: { sub: userId }, secret: process.env.NEXTAUTH_SECRET! });
  return `${getNextAuthCookieName()}=${jwt}`;
}
