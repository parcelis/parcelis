import { expect, test } from "@playwright/test";
import { queueNames } from "../../packages/jobs/src/queue-names";
import { test as authenticatedTest } from "./fixtures/authenticated";

test("serves uncached API health through the web origin", async ({ request }) => {
  const response = await request.get("/api/v1/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toMatchObject({ data: { status: "ok", service: "parcelis-api" } });
});

test("protects tRPC, REST, and dashboard requests without a session", async ({ request }) => {
  for (const path of ["/trpc/auth.me", "/api/v1/tags", "/admin/jobs/?embedded=1"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(response.headers()["cache-control"], path).toContain("no-store");
  }
});

authenticatedTest("loads authenticated API reads and the embedded job dashboard", async ({ page }) => {
  for (const path of ["/trpc/auth.me", "/api/v1/tags", "/admin/jobs/api/queues"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["cache-control"], path).toContain("no-store");
    expect(response.headers()["content-type"], path).toContain("application/json");
    await response.json();
  }
  await page.goto("/settings/jobs");
  const frame = page.frameLocator('iframe[title="Job dashboard"]');
  await expect(frame.locator("body")).toBeVisible();
  await expect(frame.getByPlaceholder("Filter queues")).toBeVisible();
  for (const name of Object.values(queueNames)) {
    await expect(frame.getByText(name, { exact: true }).first()).toBeVisible();
  }
});
