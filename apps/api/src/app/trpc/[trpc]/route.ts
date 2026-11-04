import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getPrisma } from "../../../modules/prisma";
import { appRouter } from "../../../router/app.router";
import { createFetchContext } from "../../../router/fetch-context";
import { applyApiHeaders, handlePreflight } from "../../../router/http";
import { limitBugReportRequest } from "../../../modules/bug-report-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const limitedRequest = await limitBugReportRequest(request);
  if (limitedRequest instanceof Response) return applyApiHeaders(request, limitedRequest);
  const context = createFetchContext(getPrisma(), request);
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: limitedRequest,
    router: appRouter,
    createContext: context,
  });
  return applyApiHeaders(request, response);
}

export { handler as GET, handler as POST };

export function OPTIONS(request: Request) {
  return handlePreflight(request, ["GET", "POST"]);
}
