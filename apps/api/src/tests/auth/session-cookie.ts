import { encode } from "next-auth/jwt";
export const nextAuthCookieName = "next-auth.session-token";

export async function createTestSessionCookie(userId = "7") {
  process.env.NEXTAUTH_URL ||= "http://localhost:30000";
  process.env.NEXTAUTH_SECRET ||= "nextauth-session-fixture-secret-not-for-production";
  const jwt = await encode({ token: { sub: userId }, secret: process.env.NEXTAUTH_SECRET });
  return `${nextAuthCookieName}=${jwt}`;
}
