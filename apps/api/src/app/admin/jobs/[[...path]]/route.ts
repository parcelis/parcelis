import { createJobDashboardHandler } from "../../../../modules/job-dashboard";
import { getPrisma } from "../../../../modules/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handler(request: Request) {
  return createJobDashboardHandler(getPrisma())(request);
}

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
