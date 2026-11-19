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
  const response = await page.request.get("/trpc/organizations.active");
  const organization = (await response.json()).result.data;
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
      procedure === "tenants.byId"
        ? tenant
        : procedure === "organizations.active"
          ? { ...organization, timeZone: "UTC" }
          : [];
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

test("tenant balances and links include former recipients and deduplicate shared invoices", async ({
  context,
  page,
}) => {
  const response = await page.request.get("/trpc/organizations.active");
  const organization = (await response.json()).result.data;
  const invoice = {
    id: 901,
    invoiceNumber: 901,
    dueOn: "2000-01-01T00:00:00.000Z",
    status: "overdue",
    amountCents: 15000,
    balanceCents: 12345,
  };
  let requestedTenantId: number | undefined;
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}");
    const results = procedures.map((procedure, index) => {
      let data: unknown = [];
      if (procedure === "auth.me") data = user;
      if (procedure === "organizations.active") data = { ...organization, timeZone: "UTC" };
      if (procedure === "tenants.byId") data = tenant;
      if (procedure === "invoices.list") {
        requestedTenantId = inputs[String(index)]?.tenantId;
        data = [invoice, invoice, { ...invoice, id: 902, status: "void" }];
      }
      return { result: { data } };
    });
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
  await page.goto("/tenants/12");
  await expect(page.getByText("$123.45 overdue", { exact: true })).toBeVisible();
  await expect(page.getByText("$26.55", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveAttribute(
    "href",
    /income\/invoices\/901/,
  );
  expect(requestedTenantId).toBe(12);
});
