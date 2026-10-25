import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { checkHttp, runCheck, type ServiceCheck } from "../../modules/service-checks";
import { applyCheckResults, overallStatus, updateComponent, visibleComponent } from "../../status/state";
import { renderStatusPage } from "../../status/page";

const check = (status: ServiceCheck["status"]): ServiceCheck => ({
  id: "api",
  name: "API",
  status,
  checkedAt: new Date().toISOString(),
  latencyMs: 1,
});

test("three consecutive failures confirm an outage and success resets the count", () => {
  let component = updateComponent(undefined, check("operational"));
  component = updateComponent(component, check("down"));
  assert.equal(component.status, "degraded");
  component = updateComponent(component, check("down"));
  assert.equal(component.status, "degraded");
  component = updateComponent(component, check("down"));
  assert.equal(component.status, "down");
  component = updateComponent(component, check("operational"));
  assert.equal(component.failures, 0);
  assert.equal(component.status, "operational");
  assert.equal(updateComponent(component, check("down")).status, "degraded");
});

test("unknown and degraded samples retain outage evidence until an operational recovery", () => {
  let component = updateComponent(undefined, check("down"));
  component = updateComponent(component, check("unknown"));
  assert.equal(component.failures, 1);
  assert.equal(component.status, "unknown");
  component = updateComponent(component, check("down"));
  component = updateComponent(component, check("degraded"));
  assert.equal(component.failures, 2);
  component = updateComponent(component, check("down"));
  assert.equal(component.status, "down");
  component = updateComponent(component, check("unknown"));
  assert.equal(component.failures, 3);
  assert.equal(updateComponent(component, check("down")).status, "down");
  component = updateComponent(component, check("operational"));
  assert.equal(component.failures, 0);
  assert.equal(updateComponent(component, check("down")).status, "degraded");
});

test("stale results become unknown and history stays bounded", () => {
  let component = updateComponent(undefined, check("operational"));
  assert.equal(visibleComponent(component, Date.parse(component.checkedAt) + 90_001).status, "unknown");
  for (let index = 0; index < 3000; index++) component = updateComponent(component, check("operational"));
  assert.equal(component.history.length, 2880);
  assert.equal(overallStatus([]), "unknown");
  assert.equal(overallStatus([{ status: "operational" }, { status: "down" }]), "down");
});

test("probe failures do not expose exception details", async () => {
  const result = await runCheck("database", "PostgreSQL", async () => {
    throw new Error("postgres://private-password@internal-host");
  });
  assert.equal(result.status, "down");
  assert.ok(!JSON.stringify(result).includes("private-password"));
});

test("measured degradation takes precedence over unknown components", () => {
  assert.equal(overallStatus([{ status: "unknown" }, { status: "degraded" }]), "degraded");
  assert.equal(overallStatus([{ status: "unknown" }, { status: "down" }, { status: "degraded" }]), "down");
  assert.equal(overallStatus([{ status: "operational" }, { status: "unknown" }]), "unknown");
});

test("all component results are applied before transition delivery begins", () => {
  const components = new Map([
    ["api", updateComponent(undefined, check("operational"))],
    ["web", updateComponent(undefined, { ...check("operational"), id: "web", name: "Web" })],
  ]);
  const alerts = applyCheckResults(components, [check("degraded"), { ...check("unknown"), id: "web", name: "Web" }]);
  assert.equal(components.get("api")?.status, "degraded");
  assert.equal(components.get("web")?.status, "unknown");
  assert.deepEqual(
    alerts.map((alert) => [alert.component, alert.previous, alert.status]),
    [
      ["API", "operational", "degraded"],
      ["Web", "operational", "unknown"],
    ],
  );
  assert.equal(applyCheckResults(components, [check("degraded")]).length, 0);
});

test("a stalled probe returns down at the response deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const result = runCheck("stalled", "Stalled service", () => new Promise(() => {}));
  t.mock.timers.tick(5_001);
  assert.equal((await result).status, "down");
});

test("HTTP probes require success and expected content", async () => {
  const server = createServer((request, response) => {
    response.statusCode = request.url === "/error" ? 503 : 200;
    response.end(request.url === "/wrong" ? "Other application" : "Parcelis");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await checkHttp("web", "Web", url, "Parcelis")).status, "operational");
    assert.equal((await checkHttp("web", "Web", `${url}/wrong`, "Parcelis")).status, "down");
    assert.equal((await checkHttp("web", "Web", `${url}/error`, "Parcelis")).status, "down");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("status page escapes component names", () => {
  const component = updateComponent(undefined, { ...check("down"), name: "<script>alert(1)</script>" });
  const html = renderStatusPage("degraded", [component]);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
