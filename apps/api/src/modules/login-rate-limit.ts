import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";

const maxAttempts = 5;
const windowMs = 15 * 60 * 1000;
const sweepIntervalMs = 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
let lastSweepAt = 0;

function getAttempt(key: string, now = Date.now()) {
  const attempt = attempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    attempts.delete(key);
    return null;
  }
  return attempt;
}

function sweepExpiredAttempts(now: number) {
  if (now - lastSweepAt < sweepIntervalMs) {
    return;
  }

  lastSweepAt = now;
  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) {
      attempts.delete(key);
    }
  }
}

export function consumeLoginRateLimit(key: string) {
  const now = Date.now();
  sweepExpiredAttempts(now);
  const attempt = getAttempt(key, now);
  if ((attempt?.count ?? 0) >= maxAttempts) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
  }
  attempts.set(key, {
    count: (attempt?.count ?? 0) + 1,
    resetAt: attempt?.resetAt ?? now + windowMs,
  });
}

export function consumePasswordResetRateLimit(key: string) {
  consumeLoginRateLimit(key);
}

export function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}

export function getLoginRateLimitKey(ip: string | undefined, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getRateLimitKey(ip, normalizedEmail);
}

export function getPasswordChangeRateLimitKey(ip: string | undefined, userId: number) {
  return getRateLimitKey(ip, `password-change:${userId}`);
}

export function getPasswordResetRateLimitKey(ip: string | undefined, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getRateLimitKey(ip, `password-reset:${normalizedEmail}`);
}

function getRateLimitKey(ip: string | undefined, identifier: string) {
  return createHash("sha256")
    .update(`${ip ?? "unknown"}\0${identifier}`)
    .digest("base64url");
}
