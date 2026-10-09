import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const organizationCookieName = "parcelis-organization-slug";
function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

async function hasOrganizationAccess(request: NextRequest, slug: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  try {
    const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:40010";
    const response = await fetch(`${apiUrl}/trpc/organizations.active?input=${encodeURIComponent('{"json":null}')}`, {
      headers: { cookie, "x-parcelis-organization-slug": slug },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function hasValidSession(request: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret?.trim()) return false;
  return Boolean(await getToken({ req: request, secret }));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin/jobs/") && pathname !== "/admin/jobs/") {
    return NextResponse.next();
  }
  if (!(await hasValidSession(request))) return redirectToLogin(request);

  if (request.headers.get("x-parcelis-internal-rewrite") === "1") return NextResponse.next();

  if (pathname === "/admin/jobs" || pathname === "/admin/jobs/") {
    if (request.nextUrl.searchParams.get("embedded") !== "1") {
      return NextResponse.redirect(new URL("/settings/jobs", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/o/")) {
    const [, , slug, ...path] = pathname.split("/");
    if (!slug) return NextResponse.redirect(new URL("/", request.url));
    if (!(await hasOrganizationAccess(request, slug))) {
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
    if (!(await hasOrganizationAccess(request, organizationSlug))) {
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
    "/applications/:path*",
    "/admin/jobs/:path*",
    "/o/:path*",
    "/income/:path*",
    "/maintenance/:path*",
    "/properties/:path*",
    "/settings/:path*",
    "/tenants/:path*",
  ],
};
