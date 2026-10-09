import { decode } from "next-auth/jwt";
import type { SessionRequest } from "./auth";

export const nextAuthCookieName = "parcelis_nextauth_v1";
export const nextAuthSessionMaxAge = 7 * 24 * 60 * 60;

export class NextAuthConfigurationError extends Error {}

export function getNextAuthSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) throw new NextAuthConfigurationError("NEXTAUTH_SECRET is required for NextAuth authentication.");
  return secret;
}

export function getNextAuthConfiguration() {
  const secret = getNextAuthSecret();
  try {
    const url = new URL(process.env.NEXTAUTH_URL ?? "");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
    return { secret, origin: url.origin };
  } catch {
    throw new NextAuthConfigurationError("NEXTAUTH_URL must be the public Parcelis HTTP or HTTPS URL.");
  }
}

export function getNextAuthCookies(request: SessionRequest) {
  return (request.headers.cookie?.split(";") ?? [])
    .map((cookie) => cookie.trim())
    .filter((cookie) => {
      const name = cookie.slice(0, cookie.indexOf("="));
      return name === nextAuthCookieName || new RegExp(`^${nextAuthCookieName}\\.\\d+$`).test(name);
    });
}

export async function readNextAuthToken(request: SessionRequest) {
  const cookies = getNextAuthCookies(request);
  if (!cookies.length) return { present: false, token: null };
  const encoded = cookies
    .sort((left, right) => {
      const index = (cookie: string) => Number(cookie.slice(0, cookie.indexOf("=")).split(".")[1] ?? -1);
      return index(left) - index(right);
    })
    .map((cookie) => cookie.slice(cookie.indexOf("=") + 1))
    .join("");
  try {
    const jwt = await decode({ token: encoded, secret: getNextAuthSecret() });
    return { present: true, token: typeof jwt?.sessionToken === "string" ? jwt.sessionToken : null };
  } catch {
    return { present: true, token: null };
  }
}
