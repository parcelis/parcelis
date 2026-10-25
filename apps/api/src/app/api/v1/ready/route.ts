import { createReadinessCheck } from "../../../../modules/readiness";
import { applyApiHeaders, handlePreflight } from "../../../../router/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const checkReadiness = createReadinessCheck();

export async function GET(request: Request) {
  const ready = await checkReadiness();
  return applyApiHeaders(
    request,
    Response.json(
      { data: { status: ready ? "ok" : "unavailable" } },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    ),
  );
}

export function OPTIONS(request: Request) {
  return handlePreflight(request, ["GET", "HEAD"]);
}
