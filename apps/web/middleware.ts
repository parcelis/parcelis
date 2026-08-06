import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "parcelis_session";
const isAuthenticationDisabled =
  process.env.AUTH_DISABLED === "true" && ["development", "test"].includes(process.env.NODE_ENV ?? "");

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  if (isAuthenticationDisabled) return NextResponse.next();
  if (request.cookies.has(sessionCookieName)) return NextResponse.next();

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/", "/maintenance/:path*", "/properties/:path*", "/settings/:path*", "/tenants/:path*"],
};
