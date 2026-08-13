import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "parcelis_session";
const organizationCookieName = "parcelis-organization-slug";
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
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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
  if (request.headers.get("x-parcelis-internal-rewrite") === "1") return NextResponse.next();

  if (!isAuthenticationDisabled && !(await hasValidSession(request))) return redirectToLogin(request);

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/o/")) {
    const [, , slug, ...path] = pathname.split("/");
    if (!slug) return NextResponse.redirect(new URL("/", request.url));

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-parcelis-internal-rewrite", "1");
    const response = NextResponse.rewrite(new URL(`/${path.join("/")}`, request.url), {
      request: { headers: requestHeaders },
    });
    response.cookies.set(organizationCookieName, slug, { path: "/", sameSite: "lax" });
    return response;
  }

  const organizationSlug = request.cookies.get(organizationCookieName)?.value;
  if (organizationSlug) {
    return NextResponse.redirect(new URL(`/o/${organizationSlug}${pathname === "/" ? "" : pathname}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/o/:path*", "/income/:path*", "/maintenance/:path*", "/properties/:path*", "/settings/:path*", "/tenants/:path*"],
};
