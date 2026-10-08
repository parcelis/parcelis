import { readSession } from "./session";
import type { PrismaService } from "./prisma.service";
import type { RequestHandler } from "express";
import { getJobDashboardAccessStatus } from "./job-dashboard-access";

export function createJobDashboardAuthMiddleware(prisma: PrismaService): RequestHandler {
  return async (request, response, next) => {
    try {
      const session = await readSession(prisma, request, response);

      const status = getJobDashboardAccessStatus(session?.user.role ?? null, request.method, request.headers.origin);
      if (status) {
        response.sendStatus(status);
        return;
      }

      response.setHeader("Cache-Control", "private, no-store");
      next();
    } catch (error) {
      next(error);
    }
  };
}
