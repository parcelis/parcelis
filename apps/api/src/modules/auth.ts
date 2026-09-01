import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import type { Request, Response } from "express";

const sessionCookieName = "parcelis_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7;
const passwordResetTokenDurationMs = 1000 * 60 * 30;

export function isAuthenticationDisabled() {
  return process.env.AUTH_DISABLED === "true" && ["development", "test"].includes(process.env.NODE_ENV ?? "");
}

function getCookieOptions() {
  const isLocalEnvironment = ["development", "test"].includes(process.env.NODE_ENV ?? "");

  return {
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.AUTH_COOKIE_SECURE ? process.env.AUTH_COOKIE_SECURE === "true" : !isLocalEnvironment,
    path: "/",
  };
}

export const passwordHashOptions = {
  type: argon2.argon2id as 2,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string) {
  return argon2.hash(password, passwordHashOptions);
}

export function verifyPassword(passwordHash: string, password: string) {
  return argon2.verify(passwordHash, password);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export const createPasswordResetToken = createSessionToken;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const hashPasswordResetToken = hashSessionToken;

export function getSessionToken(request: Request) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${sessionCookieName}=`));
  return sessionCookie?.split("=").slice(1).join("=");
}

export function setSessionCookie(response: Response, token: string) {
  response.cookie(sessionCookieName, token, {
    ...getCookieOptions(),
    httpOnly: true,
    maxAge: sessionDurationMs,
  });
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(sessionCookieName, getCookieOptions());
}

export function getSessionExpiration() {
  return new Date(Date.now() + sessionDurationMs);
}

export function getPasswordResetTokenExpiration() {
  return new Date(Date.now() + passwordResetTokenDurationMs);
}
