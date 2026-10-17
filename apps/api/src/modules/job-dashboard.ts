import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createQueueRegistry, getRedisConnectionOptions, type QueueRegistry } from "@parcelis/jobs";
import type { PrismaClient } from "@parcelis/db";
import type { Queue } from "bullmq";
import { Hono } from "hono";
import { getJobDashboardAccessStatus } from "./job-dashboard-access";
import { addJobDashboardLogo } from "./job-dashboard-branding";
import { jobDashboardOptions } from "./job-dashboard-options";
import { sanitizeJobResponse } from "./job-dashboard-redaction";
import { readSession } from "./session";
import { registerApiCleanup } from "./runtime-cleanup";

const basePath = "/admin/jobs";
const dashboardGlobal = globalThis as typeof globalThis & {
  parcelisJobDashboardQueues?: QueueRegistry;
};
let dashboard: Hono | undefined;

export function createJobDashboard(queues: readonly Queue[]) {
  const adapter = new HonoAdapter(serveStatic).setBasePath(basePath);
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter: adapter,
    options: jobDashboardOptions,
  });
  return new Hono({ strict: false }).route(basePath, adapter.registerPlugin());
}

function getJobDashboard() {
  if (!dashboard) {
    if (!dashboardGlobal.parcelisJobDashboardQueues) {
      dashboardGlobal.parcelisJobDashboardQueues = createQueueRegistry(getRedisConnectionOptions());
      registerApiCleanup(closeJobDashboard);
    }
    dashboard = createJobDashboard(Object.values(dashboardGlobal.parcelisJobDashboardQueues));
  }
  return dashboard;
}

export async function closeJobDashboard() {
  const queues = dashboardGlobal.parcelisJobDashboardQueues;
  delete dashboardGlobal.parcelisJobDashboardQueues;
  dashboard = undefined;
  const results = await Promise.allSettled(
    Object.values(queues ?? {}).map((queue) => Promise.resolve().then(() => queue.close())),
  );
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Queue cleanup failed.",
    );
}

async function protectJobDashboardResponse(response: Response, request: Request) {
  if (response.status >= 500) {
    await response.body?.cancel();
    return Response.json(
      { error: { key: "ERRORS.INTERNAL_SERVER_ERROR" } },
      { status: response.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (response.body && (contentType.includes("application/json") || contentType.includes("text/html"))) {
    const responseKey = /^\/admin\/jobs\/api\/queues\/[^/]+\/[^/]+\/logs\/?$/.test(new URL(request.url).pathname)
      ? "logs"
      : undefined;
    const body = contentType.includes("application/json")
      ? JSON.stringify(sanitizeJobResponse(await response.json(), responseKey))
      : addJobDashboardLogo(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("etag");
    response = new Response(body, { status: response.status, headers });
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function createJobDashboardHandler(prisma: PrismaClient, getDashboard = getJobDashboard) {
  return async (request: Request) => {
    try {
      const session = await readSession(prisma, { headers: { cookie: request.headers.get("cookie") ?? undefined } });
      const status = getJobDashboardAccessStatus(
        session?.user.role ?? null,
        request.method,
        request.headers.get("origin") ?? undefined,
      );
      let response: Response;
      if (status) {
        response = new Response(null, { status });
      } else if (new URL(request.url).pathname === basePath) {
        const url = new URL(request.url);
        url.pathname += "/";
        response = new Response(null, { status: 308, headers: { Location: url.toString() } });
      } else {
        response = await getDashboard().fetch(request);
      }
      return protectJobDashboardResponse(response, request);
    } catch {
      console.error("Job dashboard request failed.");
      return protectJobDashboardResponse(new Response(null, { status: 500 }), request);
    }
  };
}
