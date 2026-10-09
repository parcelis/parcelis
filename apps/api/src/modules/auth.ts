import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
const passwordResetTokenDurationMs = 1000 * 60 * 30;
const emailVerificationTokenDurationMs = 1000 * 60 * 60 * 24;

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

function createRecoveryToken() {
  return randomBytes(32).toString("base64url");
}

export const createPasswordResetToken = createRecoveryToken;
export const createEmailVerificationToken = createRecoveryToken;

function hashRecoveryToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const hashPasswordResetToken = hashRecoveryToken;
export const hashEmailVerificationToken = hashRecoveryToken;

export function getPasswordResetTokenExpiration() {
  return new Date(Date.now() + passwordResetTokenDurationMs);
}

export function getEmailVerificationTokenExpiration() {
  return new Date(Date.now() + emailVerificationTokenDurationMs);
}

export function getLoginTokenUrl(mode: "reset" | "verify", token: string) {
  const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;
  const url = new URL("/login", webOrigin);
  url.searchParams.set("mode", mode);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function getEmailVerificationUrl(token: string) {
  return getLoginTokenUrl("verify", token);
}
