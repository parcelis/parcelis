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
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) return false;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const response = await fetch(`${apiUrl}/trpc/auth.me?input=${encodeURIComponent('{"json":null}')}`, {
      headers: { cookie: `${sessionCookieName}=${token}` },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  if (isAuthenticationDisabled) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/", "/maintenance/:path*", "/properties/:path*", "/settings/:path*", "/tenants/:path*"],
};
