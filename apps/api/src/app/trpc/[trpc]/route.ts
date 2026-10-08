import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getPrisma } from "../../../modules/prisma";
import { appRouter } from "../../../router/app.router";
import { createFetchContext } from "../../../router/fetch-context";
import { applyApiHeaders, handlePreflight } from "../../../router/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const context = createFetchContext(getPrisma(), request);
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext: context.createContext,
  });
  return applyApiHeaders(request, context.applyCookies(response));
}

export { handler as GET, handler as POST, handlePreflight as OPTIONS };
