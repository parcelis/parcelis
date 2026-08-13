import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getSessionToken, hashSessionToken } from "../modules/auth";
import type { PrismaService } from "../modules/prisma.service";

export function createContext(prisma: PrismaService) {
  return async (opts: CreateExpressContextOptions) => {
    const sessionToken = getSessionToken(opts.req);
    const session = sessionToken
      ? await prisma.session.findFirst({
          where: {
            tokenHash: hashSessionToken(sessionToken),
            expiresAt: { gt: new Date() },
            revokedAt: null,
            user: { accountStatus: "active" },
          },
          include: { user: { select: { id: true, name: true, email: true, role: true, accountStatus: true } } },
        })
      : null;

    const organization = session
      ? await prisma.organizationMembership.findFirst({
          where: {
            userId: session.userId,
            ...(session.activeOrganizationId ? { organizationId: session.activeOrganizationId } : {}),
          },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

    return { prisma, req: opts.req, res: opts.res, session, organization };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
