import { TRPCError } from "@trpc/server";

const maxAttempts = 5;
const windowMs = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getAttempt(key: string) {
  const attempt = attempts.get(key);
  if (!attempt || attempt.resetAt <= Date.now()) {
    attempts.delete(key);
    return null;
  }
  return attempt;
}

export function assertLoginRateLimit(key: string) {
  if ((getAttempt(key)?.count ?? 0) >= maxAttempts) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
  }
}

export function recordFailedLogin(key: string) {
  const attempt = getAttempt(key);
  attempts.set(key, {
    count: (attempt?.count ?? 0) + 1,
    resetAt: attempt?.resetAt ?? Date.now() + windowMs,
  });
}

export function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}

export function getLoginRateLimitKey(ip: string | undefined, _email: string) {
  return ip ?? "unknown";
}
