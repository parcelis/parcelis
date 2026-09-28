import { hashSessionToken, getSessionToken } from "./auth";
import type { PrismaService } from "./prisma.service";
import type { RequestHandler } from "express";

export function createJobDashboardAuthMiddleware(prisma: PrismaService): RequestHandler {
  return async (request, response, next) => {
    const sessionToken = getSessionToken(request);

    if (!sessionToken) {
      response.sendStatus(401);
      return;
    }

    try {
      const session = await prisma.session.findFirst({
        where: {
          tokenHash: hashSessionToken(sessionToken),
          expiresAt: { gt: new Date() },
          revokedAt: null,
          user: { accountStatus: "active" },
        },
        select: { user: { select: { role: true } } },
      });

      if (!session) {
        response.sendStatus(401);
        return;
      }

      if (session.user.role !== "administrator") {
        response.sendStatus(403);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.sendStatus(405);
        return;
      }

      response.setHeader("Cache-Control", "private, no-store");
      next();
    } catch (error) {
      next(error);
    }
  };
}
