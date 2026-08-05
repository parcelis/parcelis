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
          },
          include: { user: { select: { id: true, email: true } } },
        })
      : null;

    return { prisma, req: opts.req, res: opts.res, session };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
