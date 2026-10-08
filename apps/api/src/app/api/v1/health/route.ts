import { getApiHealth } from "../../../../modules/health";
import { applyApiHeaders, handlePreflight } from "../../../../router/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return applyApiHeaders(request, Response.json(getApiHealth()));
}

export { handlePreflight as OPTIONS };
