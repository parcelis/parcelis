import { checkDependencies } from "../../../../modules/service-checks";
import { applyApiHeaders, handlePreflight } from "../../../../router/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const checks = await checkDependencies();
  const ready = checks.every((check) => check.status === "operational");
  return applyApiHeaders(
    request,
    Response.json({ data: { status: ready ? "ok" : "unavailable" } }, { status: ready ? 200 : 503 }),
  );
}

export function OPTIONS(request: Request) {
  return handlePreflight(request, ["GET", "HEAD"]);
}
