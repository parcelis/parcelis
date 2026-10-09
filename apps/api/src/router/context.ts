import type { PrismaClient } from "@parcelis/db";
import { readSession } from "../modules/session";

export type ApiRequest = {
  headers: { cookie?: string; [name: string]: string | string[] | undefined };
  ip?: string;
};

type ContextOptions = { req: ApiRequest };

export function createContext(prisma: PrismaClient) {
  return async (opts: ContextOptions) => {
    const session = await readSession(prisma, opts.req);

    const requestedOrganizationSlug = opts.req.headers["x-parcelis-organization-slug"];
    const organizationSlug = Array.isArray(requestedOrganizationSlug)
      ? requestedOrganizationSlug[0]
      : requestedOrganizationSlug;
    const organization = session
      ? session.user.role === "administrator"
        ? await prisma.organization
            .findFirst({
              where: organizationSlug
                ? { slug: organizationSlug }
                : { id: session.user.defaultOrganizationId ?? undefined },
              orderBy: { createdAt: "asc" },
            })
            .then((activeOrganization) =>
              activeOrganization
                ? {
                    organizationId: activeOrganization.id,
                    role: "administrator" as const,
                    organization: activeOrganization,
                  }
                : null,
            )
        : await prisma.organizationMembership.findFirst({
            where: {
              userId: session.userId,
              ...(organizationSlug
                ? { organization: { slug: organizationSlug } }
                : session.user.defaultOrganizationId
                  ? { organizationId: session.user.defaultOrganizationId }
                  : {}),
            },
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          })
      : null;

    return { prisma, req: opts.req, session, organization };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
