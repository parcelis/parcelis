import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authenticationUnavailableMessage } from "@parcelis/schemas";
import { createNextAuthOptions } from "../../../../modules/nextauth";
import { getNextAuthConfiguration, NextAuthConfigurationError } from "../../../../modules/nextauth-config";
import { getPrisma } from "../../../../modules/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function handler(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  if (request.method === "GET" && params.nextauth[0] === "error") {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login?error=Configuration", "Cache-Control": "private, no-store" },
    });
  }
  let configuration;
  try {
    configuration = getNextAuthConfiguration();
  } catch (error) {
    if (!(error instanceof NextAuthConfigurationError)) throw error;
    console.error(error.message);
    return NextResponse.json(
      { error: authenticationUnavailableMessage },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const response: Response = await NextAuth(createNextAuthOptions(getPrisma(), configuration))(request, { params });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export { handler as GET, handler as POST };
