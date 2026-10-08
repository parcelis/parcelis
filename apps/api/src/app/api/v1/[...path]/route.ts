import { createOpenApiFetchHandler } from "trpc-to-openapi";
import { getPrisma } from "../../../../modules/prisma";
import { createFetchContext } from "../../../../router/fetch-context";
import { applyApiHeaders, handlePreflight } from "../../../../router/http";
import { publicRouter } from "../../../../router/public.router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const context = createFetchContext(getPrisma(), request);
  const response = await createOpenApiFetchHandler({
    endpoint: "/api/v1",
    req: request,
    router: publicRouter,
    createContext: context.createContext,
  });
  return applyApiHeaders(request, context.applyCookies(response));
}

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handlePreflight as OPTIONS,
};
