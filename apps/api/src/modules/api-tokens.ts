import { createHash, randomBytes } from "node:crypto";
import { apiTokenCredentialSchema, type ApiTokenExpiration } from "@parcelis/schemas";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@parcelis/db";

const apiTokenPrefix = "pcls_api_";

// Generates a new API token with the standard prefix and a random 32-byte value.
export function createApiToken() {
  return `${apiTokenPrefix}${randomBytes(32).toString("base64url")}`;
}

// Hashes an API token using SHA-256 and returns the hexadecimal digest.
export function hashApiToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Returns the display prefix for an API token, which includes the standard prefix and the first 10 characters of the token.
export function getApiTokenDisplayPrefix(token: string) {
  return token.slice(0, apiTokenPrefix.length + 10);
}

// Utility function to add a specified number of months to a date, preserving the day of the month as much as possible.
function addUtcMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfMonth = new Date(result);
  lastDayOfMonth.setUTCMonth(lastDayOfMonth.getUTCMonth() + 1, 0);

  result.setUTCDate(Math.min(originalDay, lastDayOfMonth.getUTCDate()));

  return result;
}

// Returns the expiration date for an API token based on the specified expiration setting. If the expiration is "never", it returns null.
export function getApiTokenExpiration(expiration: ApiTokenExpiration, now: Date = new Date()): Date | null {
  switch (expiration) {
    case "never":
      return null;
    case "7_days":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "1_month":
      return addUtcMonths(now, 1);
    case "3_months":
      return addUtcMonths(now, 3);
    case "6_months":
      return addUtcMonths(now, 6);
    case "12_months":
      return addUtcMonths(now, 12);
  }
}

// Parses the Authorization header for an API token in the format "Bearer pcls_api_<token>". Returns the token if valid, otherwise throws an error.
export function parseApiTokenAuthorization(authorization: string | string[] | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }

  if (typeof authorization !== "string") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid API token.",
    });
  }

  const match = /^Bearer (.+)$/i.exec(authorization);
  const credential = apiTokenCredentialSchema.safeParse(match?.[1]);

  if (!match || match[0] !== authorization || !credential.success) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid API token.",
    });
  }

  return credential.data;
}

// Resolves an API token by its plaintext value. Checks if the token exists, is not revoked, and has not expired. Returns the token record if valid, otherwise throws an error.
export async function resolveApiToken(prisma: PrismaClient, token: string, now: Date = new Date()) {
  const apiToken = await prisma.apiToken.findUnique({
    where: {
      tokenHash: hashApiToken(token),
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!apiToken || apiToken.revokedAt !== null || (apiToken.expiresAt !== null && apiToken.expiresAt <= now)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid API token.",
    });
  }

  return apiToken;
}
export async function updateApiTokenLastUsed(prisma: PrismaClient, tokenId: string, now: Date = new Date()) {
  await prisma.apiToken.updateMany({
    where: {
      id: tokenId,
      revokedAt: null,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date(now.getTime() - 5 * 60 * 1000) } }],
    },
    data: { lastUsedAt: now },
  });
}
