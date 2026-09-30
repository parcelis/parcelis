import { Logger } from "@nestjs/common";
import type { Prisma } from "@parcelis/db";
import type { SessionStatus } from "@parcelis/schemas";
import type { Request, Response } from "express";
import { clearSessionCookie, getSessionToken, hashSessionToken } from "./auth";
import type { PrismaService } from "./prisma.service";

const idleTimeoutMs = 15 * 60 * 1000;
const activityIntervalMs = 60 * 1000;
const logger = new Logger("Session");

export const sessionExpiredMessage = "Your session has expired. Please sign in again.";

export function isSessionIdleTimeoutEnabled() {
  return process.env.SESSION_IDLE_TIMEOUT_ENABLED !== "false";
}

export function validSessionWhere(now: Date): Prisma.SessionWhereInput {
  return {
    expiresAt: { gt: now },
    revokedAt: null,
    user: { accountStatus: "active" },
    ...(isSessionIdleTimeoutEnabled()
      ? { lastSeenAt: { gt: new Date(now.getTime() - idleTimeoutMs) } }
      : {}),
  };
}

export async function readSession(prisma: PrismaService, request: Request, response: Response) {
  const token = getSessionToken(request);
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: { tokenHash: hashSessionToken(token), ...validSessionWhere(new Date()) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          profileImageObjectKey: true,
          role: true,
          accountStatus: true,
          defaultOrganizationId: true,
        },
      },
    },
  });
  if (!session) {
    clearSessionCookie(response);
    logger.log({ event: "session_rejected" });
  }
  return session;
}

export function getSessionStatus(
  session: { expiresAt: Date; lastSeenAt: Date },
  now = new Date(),
): SessionStatus {
  const enabled = isSessionIdleTimeoutEnabled();
  return {
    expiresAt: enabled
      ? Math.min(session.expiresAt.getTime(), session.lastSeenAt.getTime() + idleTimeoutMs)
      : session.expiresAt.getTime(),
    serverTime: now.getTime(),
    idleTimeoutEnabled: enabled,
    activityIntervalMs,
    warningMs: 60 * 1000,
  };
}

export async function renewSession(prisma: PrismaService, id: number, now = new Date()) {
  // The conditional write rechecks validity after concurrent revocation or renewal.
  const result = await prisma.session.updateMany({
    where: {
      id,
      ...validSessionWhere(now),
      AND: { lastSeenAt: { lte: new Date(now.getTime() - activityIntervalMs) } },
    },
    data: { lastSeenAt: now },
  });
  if (result.count) logger.log({ event: "session_activity_updated" });
  const session = await prisma.session.findFirst({
    where: { id, ...validSessionWhere(new Date()) },
  });
  return session ? getSessionStatus(session) : null;
}
