import type { PrismaClient } from "@parcelis/db";
import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { createFetchContext } from "./fetch-context";
import { applyApiHeaders } from "./http";
import { publicRouter } from "./public.router";

// Handles incoming REST API requests and applies necessary headers.
export async function handleRestRequest(prisma: PrismaClient, request: Request) {
  const isHealth = new URL(request.url).pathname === "/api/v1/health";
  const contextRequest = isHealth ? new Request(request.url, { headers: new Headers() }) : request;
  const response = await createOpenApiFetchHandler({
    endpoint: "/api/v1",
    req: request,
    router: publicRouter,
    createContext: createFetchContext(prisma, contextRequest, "rest"),
  });
  // Apply API headers to the response.
  if (response.status === 401) response.headers.set("WWW-Authenticate", "Bearer");
  if (response.status >= 500) {
    return applyApiHeaders(
      request,
      Response.json({ code: "INTERNAL_SERVER_ERROR", message: "An internal server error occurred." }, { status: 500 }),
    );
  }
  return applyApiHeaders(request, response);
}
