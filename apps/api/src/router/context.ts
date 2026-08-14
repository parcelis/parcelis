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
          include: { user: { select: { id: true, name: true, email: true, role: true, accountStatus: true, defaultOrganizationId: true } } },
        })
      : null;

    const requestedOrganizationSlug = opts.req.headers["x-parcelis-organization-slug"];
    const organizationSlug = Array.isArray(requestedOrganizationSlug) ? requestedOrganizationSlug[0] : requestedOrganizationSlug;
    const organization = session
      ? session.user.role === "administrator"
        ? await prisma.organization
            .findFirst({
              where: organizationSlug
                ? { slug: organizationSlug }
                : { id: session.activeOrganizationId ?? session.user.defaultOrganizationId ?? undefined },
              orderBy: { createdAt: "asc" },
            })
            .then((activeOrganization) =>
              activeOrganization
                ? { organizationId: activeOrganization.id, role: "administrator" as const, organization: activeOrganization }
                : null,
            )
        : await prisma.organizationMembership.findFirst({
          where: {
            userId: session.userId,
            ...(organizationSlug
              ? { organization: { slug: organizationSlug } }
            : session.activeOrganizationId
                ? { organizationId: session.activeOrganizationId }
                : session.user.defaultOrganizationId
                  ? { organizationId: session.user.defaultOrganizationId }
                  : {}),
          },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

    return { prisma, req: opts.req, res: opts.res, session, organization };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
