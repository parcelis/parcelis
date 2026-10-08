import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import { queueNames, type QueueRegistry } from "@parcelis/jobs";
import type { Queue } from "bullmq";
import { Hono } from "hono";
import { sessionCookieName } from "../../modules/auth";
import { closeJobDashboard, createJobDashboard, createJobDashboardHandler } from "../../modules/job-dashboard";

const origin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.APP_PORT ?? 30000}`;

function database(role: string | null = "administrator") {
  let reads = 0;
  const prisma = {
    session: {
      findFirst: async () => {
        reads++;
        return role ? { user: { role } } : null;
      },
      updateMany: async () => {
        throw new Error("Dashboard polling must not renew session activity.");
      },
    },
  };
  return { prisma: prisma as unknown as PrismaClient, reads: () => reads };
}

function request(path = "/", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", `${sessionCookieName}=token`);
  return new Request(`http://localhost/admin/jobs${path}`, { ...init, headers });
}

test("dashboard HTML, API, and assets require a valid administrator session before initialization", async () => {
  let initialized = 0;
  const handler = createJobDashboardHandler(database(null).prisma, () => {
    initialized++;
    return createJobDashboard([]);
  });
  for (const path of ["/", "/api/queues", "/static/main.js"]) {
    const response = await handler(request(path));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(initialized, 0);
  const nonAdmin = createJobDashboardHandler(database("property_manager").prisma);
  assert.equal((await nonAdmin(request())).status, 403);
});

test("administrator dashboard renders Parcelis branding and serves its own JavaScript", async () => {
  const data = database();
  const app = createJobDashboard([]);
  const handler = createJobDashboardHandler(data.prisma, () => app);
  const response = await handler(request());
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Parcelis Jobs/);
  assert.match(html, /parcelis-lettermark-dark\.svg/);
  assert.match(html, /dark-mode/);
  assert.match(html, /"hideRedisDetails":true/);
  assert.match(html, /"hideDocsLink":true/);
  const base = html.match(/<base href="([^"]+)"/)?.[1];
  assert.equal(base, "/admin/jobs/");
  const asset = html.match(/src="(static\/[^"\s]+\.js)"/)?.[1];
  assert.ok(asset);
  const assetUrl = new URL(asset, new URL(base!, "http://localhost"));
  assert.ok(assetUrl.pathname.startsWith("/admin/jobs/static/"));
  const assetResponse = await handler(
    new Request(assetUrl, {
      headers: { cookie: `${sessionCookieName}=token` },
    }),
  );
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("content-type") ?? "", /javascript/);
  assert.ok((await assetResponse.text()).length > 100);
  assert.equal(assetResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(data.reads(), 2);
  const redisDetails = await handler(request("/api/redis/stats"));
  assert.equal(redisDetails.status, 403);
});

test("dashboard redirects its bare path without losing query parameters", async () => {
  const handler = createJobDashboardHandler(database().prisma, () => createJobDashboard([]));
  const response = await handler(request("?queue=test"));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "http://localhost/admin/jobs/?queue=test");
});

test("queue actions use the Bull Board adapter and require the configured origin", async () => {
  let paused = 0;
  const queue = {
    name: "test-queue",
    metaValues: { version: "bullmq:6" },
    pause: async () => {
      paused++;
    },
  } as unknown as Queue;
  const app = createJobDashboard([queue]);
  const handler = createJobDashboardHandler(database().prisma, () => app);
  for (const headers of [new Headers(), new Headers({ origin: "https://other.example" })]) {
    const response = await handler(request("/api/queues/test-queue/pause", { method: "PUT", headers }));
    assert.equal(response.status, 403);
  }
  assert.equal(paused, 0);
  const allowed = await handler(
    request("/api/queues/test-queue/pause", {
      method: "PUT",
      headers: { origin: new URL(origin).origin },
    }),
  );
  assert.equal(allowed.status, 200);
  assert.equal(paused, 1);
  assert.equal((await handler(request("/", { method: "OPTIONS" }))).status, 405);
});

test("Next.js dashboard responses redact private data, diagnostics, and job options", async () => {
  const app = new Hono().get("/admin/jobs/api/private", (c) =>
    c.json({
      job: {
        data: { organizationId: 3, email: "private@example.test", token: "secret" },
        opts: { attempts: 3, secret: "private" },
        failedReason: "private@example.test secret",
        stacktrace: ["private path"],
        logs: ["private log"],
        progress: { email: "private@example.test" },
        returnValue: { token: "secret" },
      },
    }),
  );
  const response = await createJobDashboardHandler(database().prisma, () => app)(request("/api/private"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    job: {
      data: { organizationId: 3 },
      opts: { attempts: 3 },
      failedReason: "Job error details redacted",
      stacktrace: ["Stack trace redacted"],
      logs: ["Log details redacted"],
      progress: "[redacted]",
      returnValue: "[redacted]",
    },
  });
});

test("Bull Board job responses redact private fields and preserve null progress and results", async () => {
  let progress: unknown = { email: "private@example.test" };
  let returnvalue: unknown = { token: "secret" };
  const queue = {
    name: "test-queue",
    metaValues: { version: "bullmq:6" },
    getJob: async () => ({
      getState: async () => "failed",
      toJSON: () => ({
        id: "1",
        name: "test-job",
        data: { organizationId: 3, email: "private@example.test", token: "secret" },
        opts: { attempts: 3, secret: "private" },
        failedReason: "private connection details",
        stacktrace: ["private path"],
        progress,
        returnvalue,
      }),
    }),
    getJobLogs: async () => ({ logs: ["private log"] }),
  } as unknown as Queue;
  const app = createJobDashboard([queue]);
  const handler = createJobDashboardHandler(database().prisma, () => app);
  const response = await handler(request("/api/queues/test-queue/1"));
  assert.equal(response.status, 200);
  const { job } = await response.json();
  assert.deepEqual(job.data, { organizationId: 3 });
  assert.deepEqual(job.opts, { attempts: 3 });
  assert.equal(job.failedReason, "Job error details redacted");
  assert.deepEqual(job.stacktrace, ["Stack trace redacted"]);
  assert.equal(job.progress, "[redacted]");
  assert.equal(job.returnValue, "[redacted]");
  const logs = await handler(request("/api/queues/test-queue/1/logs"));
  assert.equal(logs.status, 200);
  assert.deepEqual(await logs.json(), ["Log details redacted"]);

  progress = null;
  returnvalue = null;
  const empty = await handler(request("/api/queues/test-queue/1"));
  assert.equal(empty.status, 200);
  const { job: emptyJob } = await empty.json();
  assert.equal(emptyJob.progress, null);
  assert.equal(emptyJob.returnValue, null);
});

test("dashboard failures return an uncached response without raw diagnostics", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const response = await createJobDashboardHandler(database().prisma, () => {
    throw new Error("private connection details");
  })(request("/api/queues"));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { key: "ERRORS.INTERNAL_SERVER_ERROR" } });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(log.mock.callCount(), 1);
  assert.deepEqual(log.mock.calls[0]?.arguments, ["Job dashboard request failed."]);
});

test("Bull Board adapter failures do not expose exception messages or stack traces", async () => {
  const queue = {
    name: "test-queue",
    metaValues: { version: "bullmq:6" },
    pause: async () => {
      throw new Error("private connection details");
    },
  } as unknown as Queue;
  const app = createJobDashboard([queue]);
  const response = await createJobDashboardHandler(
    database().prisma,
    () => app,
  )(request("/api/queues/test-queue/pause", { method: "PUT", headers: { origin: new URL(origin).origin } }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { key: "ERRORS.INTERNAL_SERVER_ERROR" } });
});

test("dashboard reuses cached queue connections and closes all of them on cleanup", async (t) => {
  const dashboardGlobal = globalThis as typeof globalThis & {
    parcelisJobDashboardQueues?: QueueRegistry;
  };
  assert.equal(dashboardGlobal.parcelisJobDashboardQueues, undefined);
  let closed = 0;
  const queues = Object.fromEntries(
    Object.entries(queueNames).map(([key, name]) => [
      key,
      {
        name,
        metaValues: { version: "bullmq:6" },
        close: async () => {
          closed++;
        },
      },
    ]),
  ) as unknown as QueueRegistry;
  dashboardGlobal.parcelisJobDashboardQueues = queues;
  t.after(closeJobDashboard);
  const handler = createJobDashboardHandler(database().prisma);
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  assert.equal(dashboardGlobal.parcelisJobDashboardQueues, queues);
  await closeJobDashboard();
  assert.equal(closed, Object.keys(queueNames).length);
  assert.equal(dashboardGlobal.parcelisJobDashboardQueues, undefined);
});

test("dashboard cleanup waits for all queues even when one fails", async () => {
  const dashboardGlobal = globalThis as typeof globalThis & {
    parcelisJobDashboardQueues?: QueueRegistry;
  };
  let finished = false;
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  dashboardGlobal.parcelisJobDashboardQueues = {
    failed: {
      close: async () => {
        throw new Error("Redis unavailable");
      },
    },
    pending: {
      close: async () => {
        await pending;
        finished = true;
      },
    },
  } as unknown as QueueRegistry;
  const closed = assert.rejects(closeJobDashboard(), AggregateError);
  assert.equal(finished, false);
  finish();
  await closed;
  assert.equal(finished, true);
  assert.equal(dashboardGlobal.parcelisJobDashboardQueues, undefined);
});
