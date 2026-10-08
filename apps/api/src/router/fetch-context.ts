import { isIP } from "node:net";
import type { PrismaClient } from "@parcelis/db";
import { NextResponse } from "next/server";
import type { SessionResponse } from "../modules/auth";
import { createContext } from "./context";

export function getClientIp(request: Request) {
  const trustedHops = Number(process.env.API_TRUST_PROXY_HOPS ?? 0);
  if (!Number.isSafeInteger(trustedHops) || trustedHops < 0) {
    throw new Error("API_TRUST_PROXY_HOPS must be a non-negative integer.");
  }
  if (trustedHops === 0) return undefined;

  const addresses = request.headers.get("x-forwarded-for")?.split(",");
  const address = addresses?.at(-trustedHops)?.trim();
  return address && isIP(address) ? address : undefined;
}

export function createFetchContext(prisma: PrismaClient, request: Request) {
  const cookieResponse = new NextResponse(null);
  const res: SessionResponse = {
    cookie(name, value, { maxAge, ...options }) {
      cookieResponse.cookies.set(name, value, {
        ...options,
        maxAge: maxAge === undefined ? undefined : Math.floor(maxAge / 1000),
      });
    },
    clearCookie(name, options) {
      cookieResponse.cookies.set(name, "", { ...options, expires: new Date(0), maxAge: 0 });
    },
  };

  return {
    createContext: () =>
      createContext(prisma)({
        req: {
          headers: {
            cookie: request.headers.get("cookie") ?? undefined,
            "x-parcelis-organization-slug": request.headers.get("x-parcelis-organization-slug") ?? undefined,
          },
          ip: getClientIp(request),
        },
        res,
      }),
    applyCookies(response: Response) {
      for (const cookie of cookieResponse.headers.getSetCookie()) {
        response.headers.append("Set-Cookie", cookie);
      }
      return response;
    },
  };
}
