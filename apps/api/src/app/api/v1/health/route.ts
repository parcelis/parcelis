import { getApiHealth } from "../../../../modules/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getApiHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
