import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "parcelis_session";
const isAuthenticationDisabled =
  process.env.AUTH_DISABLED === "true" && ["development", "test"].includes(process.env.NODE_ENV ?? "");

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

async function hasValidSession(request: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  try {
    const response = await fetch(`${apiUrl}/trpc/auth.me?input=${encodeURIComponent('{"json":null}')}`, {
      headers: { cookie },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  if (isAuthenticationDisabled) return NextResponse.next();
  if (request.cookies.has(sessionCookieName) && (await hasValidSession(request))) return NextResponse.next();

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/", "/maintenance/:path*", "/properties/:path*", "/settings/:path*", "/tenants/:path*"],
};
