import type { Organization, PrismaClient } from "@parcelis/db";
import { readSession } from "../modules/session";
import { parseApiTokenAuthorization, resolveApiToken } from "../modules/api-tokens";
import { TRPCError } from "@trpc/server";

export type ApiRequest = {
  headers: { cookie?: string; [name: string]: string | string[] | undefined };
  ip?: string;
};

// Defines the transport methods for the API context.
export type ApiTransport = "rest" | "trpc";
// Options for creating the API context.
type ContextOptions = {
  req: ApiRequest;
  transport?: ApiTransport;
};

export type ApiPrincipal =
  | {
      kind: "user";
      userId: number;
    }
  | {
      kind: "api-token";
      tokenId: string;
      tokenName: string;
      organizationId: number;
      organization: Organization;
    };

export function createContext(prisma: PrismaClient) {
  return async (opts: ContextOptions) => {
    const transport = opts.transport ?? "trpc";
    const token = transport === "rest" ? parseApiTokenAuthorization(opts.req.headers.authorization) : null;

    const apiToken = token ? await resolveApiToken(prisma, token) : null;
    const session = apiToken ? null : await readSession(prisma, opts.req);

    const principal: ApiPrincipal | null = apiToken
      ? {
          kind: "api-token",
          tokenId: apiToken.id,
          tokenName: apiToken.name,
          organizationId: apiToken.organizationId,
          organization: apiToken.organization,
        }
      : session
        ? {
            kind: "user",
            userId: session.userId,
          }
        : null;

    const requestedOrganizationSlug = opts.req.headers["x-parcelis-organization-slug"];
    const organizationSlug =
      (Array.isArray(requestedOrganizationSlug) ? requestedOrganizationSlug[0] : requestedOrganizationSlug) ||
      undefined;
    if (apiToken && organizationSlug !== undefined && organizationSlug !== apiToken.organization.slug) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "The API token cannot access this organization.",
      });
    }
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

    return { prisma, req: opts.req, transport, session, organization, principal };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContext>>>;
