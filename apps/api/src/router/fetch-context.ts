import { isIP } from "node:net";
import type { PrismaClient } from "@parcelis/db";
import { getTrustedProxyHops } from "../modules/proxy-config";
import { createContext, type ApiTransport } from "./context";

export function getClientIp(request: Request, trustedHops = getTrustedProxyHops()) {
  if (trustedHops === 0) return undefined;

  const addresses = request.headers.get("x-forwarded-for")?.split(",");
  const address = addresses?.at(-trustedHops)?.trim();
  return address && isIP(address) ? address : undefined;
}

export function createFetchContext(prisma: PrismaClient, request: Request, transport: ApiTransport = "trpc") {
  return () =>
    createContext(prisma)({
      transport,
      req: {
        headers: {
          cookie: request.headers.get("cookie") ?? undefined,
          authorization: transport === "rest" ? (request.headers.get("authorization") ?? undefined) : undefined,
          "x-parcelis-organization-slug": request.headers.get("x-parcelis-organization-slug") ?? undefined,
        },
        ip: getClientIp(request),
      },
    });
}
