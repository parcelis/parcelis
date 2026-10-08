import { isIP } from "node:net";
import type { PrismaClient } from "@parcelis/db";
import { NextResponse } from "next/server";
import type { SessionResponse } from "../modules/auth";
import { getTrustedProxyHops } from "../modules/proxy-config";
import { createContext } from "./context";

export function getClientIp(request: Request, trustedHops = getTrustedProxyHops()) {
  if (trustedHops === 0) return undefined;

  const addresses = request.headers.get("x-forwarded-for")?.split(",");
  const address = addresses?.at(-trustedHops)?.trim();
  return address && isIP(address) ? address : undefined;
}

export function createFetchCookieResponse() {
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
    res,
    applyCookies(response: Response) {
      for (const cookie of cookieResponse.headers.getSetCookie()) {
        response.headers.append("Set-Cookie", cookie);
      }
      return response;
    },
  };
}

export function createFetchContext(prisma: PrismaClient, request: Request) {
  const cookieResponse = createFetchCookieResponse();
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
        res: cookieResponse.res,
      }),
    applyCookies: cookieResponse.applyCookies,
  };
}
