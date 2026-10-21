import { getPrisma } from "../../../../modules/prisma";
import { handlePreflight } from "../../../../router/http";
import { handleRestRequest } from "../../../../router/rest-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  return handleRestRequest(getPrisma(), request);
}

export { handler as GET, handler as HEAD, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };

export function OPTIONS(request: Request) {
  return handlePreflight(request, ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
}
