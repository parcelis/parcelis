import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "parcelis_session";
const organizationCookieName = "parcelis-organization-slug";
const isAuthenticationDisabled =
  process.env.AUTH_DISABLED === "true" && ["development", "test"].includes(process.env.NODE_ENV ?? "");

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

async function hasOrganizationAccess(request: NextRequest, slug: string) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) return false;
  try {
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const response = await fetch(`${apiUrl}/trpc/organizations.active?input=${encodeURIComponent('{"json":null}')}`, {
      headers: { cookie: `${sessionCookieName}=${token}`, "x-parcelis-organization-slug": slug },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
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
  if (!isAuthenticationDisabled && !(await hasValidSession(request))) return redirectToLogin(request);

  if (request.headers.get("x-parcelis-internal-rewrite") === "1") return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/o/")) {
    const [, , slug, ...path] = pathname.split("/");
    if (!slug) return NextResponse.redirect(new URL("/", request.url));
    if (!isAuthenticationDisabled && !(await hasOrganizationAccess(request, slug))) {
      const response = NextResponse.redirect(new URL("/", request.url));
      response.cookies.delete(organizationCookieName);
      return response;
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-parcelis-internal-rewrite", "1");
    const rewriteUrl = new URL(`/${path.join("/")}`, request.url);
    rewriteUrl.search = request.nextUrl.search;
    const response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
    response.cookies.set(organizationCookieName, slug, { path: "/", sameSite: "lax" });
    return response;
  }

  const organizationSlug = request.cookies.get(organizationCookieName)?.value;
  if (organizationSlug) {
    if (!isAuthenticationDisabled && !(await hasOrganizationAccess(request, organizationSlug))) {
      const response = NextResponse.next();
      response.cookies.delete(organizationCookieName);
      return response;
    }
    const redirectUrl = new URL(`/o/${organizationSlug}${pathname === "/" ? "" : pathname}`, request.url);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/o/:path*",
    "/income/:path*",
    "/maintenance/:path*",
    "/properties/:path*",
    "/settings/:path*",
    "/tenants/:path*",
  ],
};
