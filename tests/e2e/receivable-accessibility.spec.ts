import type { BrowserContext } from "@playwright/test";
import { expect, test } from "./fixtures/authenticated";

const user = {
  user: { id: 7, name: "Test manager", role: "property_manager" },
  permissions: Object.fromEntries(
    ["properties", "leases", "invoices", "units", "tenants"].map((resource) => [resource, { view: true }]),
  ),
};
const tenant = {
  id: 12,
  firstName: "Balance",
  lastName: "Tenant",
  email: "balance@example.test",
  accountStatus: "active",
  insuranceStatus: "active",
  tenantStatus: "active",
  emergencyContacts: [],
  leases: [],
};

async function mockQueries(context: BrowserContext, resultFor: (procedure: string) => unknown | Promise<unknown>) {
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const results = await Promise.all(procedures.map(resultFor));
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
}

test("income does not fetch invoices without lease-view permission", async ({ context, page }) => {
  const requested: string[] = [];
  await mockQueries(context, (procedure) => {
    requested.push(procedure);
    let data: unknown = [];
    if (procedure === "auth.me") data = { ...user, permissions: { ...user.permissions, leases: { view: false } } };
    if (procedure === "organizations.active") data = null;
    return { result: { data } };
  });
  await page.goto("/income");
  await expect(page.getByText("Unavailable: you do not have permission to view leases.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Income", exact: true })).toHaveCount(0);
  expect(requested).toContain("auth.me");
  expect(requested).not.toContain("invoices.list");
  expect(requested).not.toContain("properties.list");
});

test("tenant balances remain loading until permissions resolve", async ({ context, page }) => {
  let permissionRequests = 0;
  let releasePermissions!: () => void;
  const permissionsReady = new Promise<void>((resolve) => {
    releasePermissions = resolve;
  });
  await mockQueries(context, async (procedure) => {
    if (procedure === "auth.me") {
      permissionRequests += 1;
      // Let the other batched queries resolve while permissions await their retry.
      if (permissionRequests === 1)
        return {
          error: {
            message: "Retry permissions",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        };
      await permissionsReady;
      return { result: { data: user } };
    }
    const data =
      procedure === "tenants.byId" ? tenant : procedure === "organizations.active" ? { timeZone: "UTC" } : [];
    return { result: { data } };
  });
  try {
    await page.goto("/tenants/12");
    await expect(page.getByRole("heading", { name: "Balance Tenant", exact: true })).toBeVisible();
    await expect(page.getByText("Loading balance...", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Balance unavailable", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(0);
    releasePermissions();
    await expect(page.getByText("No balance overdue", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading balance...", { exact: true })).toHaveCount(0);
  } finally {
    releasePermissions();
  }
});
