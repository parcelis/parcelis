import { hashSessionToken, getSessionToken } from "./auth";
import type { PrismaService } from "./prisma.service";
import type { RequestHandler } from "express";

const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const safeMethods = new Set(["GET", "HEAD"]);

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

      if (!allowedMethods.has(request.method)) {
        response.sendStatus(405);
        return;
      }

      if (!safeMethods.has(request.method)) {
        const webOrigin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;

        if (request.headers.origin !== new URL(webOrigin).origin) {
          response.sendStatus(403);
          return;
        }
      }

      response.setHeader("Cache-Control", "private, no-store");
      next();
    } catch (error) {
      next(error);
    }
  };
}
