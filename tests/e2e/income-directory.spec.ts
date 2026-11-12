import { expect, test } from "./fixtures/authenticated";

const invoice = {
  id: 901,
  invoiceNumber: 901,
  leaseId: 11,
  propertyId: 2,
  dueOn: "2020-01-01T00:00:00.000Z",
  paidOn: null,
  status: "overdue",
  amountCents: 12345,
  balanceCents: 12345,
};
const lease = {
  id: 11,
  unitId: 3,
  unitLabel: "101",
  status: "ended",
  archivedAt: "2025-01-01T00:00:00.000Z",
  monthlyRentCents: 100000,
  tenant: null,
  tenants: [],
  // Nested property invoices deliberately differ from the authoritative directory.
  invoices: [{ ...invoice, id: 999, invoiceNumber: 999, amountCents: 99999 }],
};

test.beforeEach(async ({ context, page }) => {
  const response = await page.request.get("/trpc/organizations.active");
  expect(response.ok()).toBe(true);
  const organization = (await response.json()).result.data;
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}");
    const results = procedures.map((procedure, index) => {
      let data: unknown = [];
      if (procedure === "auth.me")
        data = {
          user: { id: 7, name: "Test manager", role: "property_manager" },
          permissions: Object.fromEntries(
            ["properties", "leases", "invoices", "units", "tenants"].map((resource) => [
              resource,
              { view: true, create: false },
            ]),
          ),
        };
      if (procedure === "organizations.active") data = { ...organization, timeZone: "UTC" };
      if (procedure === "properties.list")
        data = [
          {
            id: 2,
            name: "History House",
            units: [{ id: 3, name: "101" }],
            leases: [],
            leaseHistory: [
              lease,
              {
                ...lease,
                id: 12,
                status: "active",
                archivedAt: null,
                tenants: [{ id: 12, firstName: "Current", lastName: "Tenant" }],
                invoices: [],
              },
            ],
          },
        ];
      if (procedure === "invoices.list") {
        const tenantId = inputs[String(index)]?.tenantId;
        data =
          tenantId === 99
            ? []
            : [
                invoice,
                {
                  ...invoice,
                  id: 902,
                  invoiceNumber: 902,
                  amountCents: 6789,
                  balanceCents: 0,
                  status: "paid",
                  paidOn: "2020-01-02T00:00:00.000Z",
                },
                { ...invoice, id: 903, invoiceNumber: 903, status: "void" },
              ];
      }
      return { result: { data } };
    });
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
});

test("saved invoice directory retains history, cents, filters, and links", async ({ page }) => {
  await page.goto("/income?propertyId=2&unitId=3");
  const group = page.locator("tr").filter({ has: page.getByRole("button", { name: "Unit 101 · History House" }) });
  await expect(group).toContainText("$191.34");
  await page.getByRole("button", { name: "Unit 101 · History House" }).click();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Grouped By Unit" }).click();
  const rows = page.locator("tr");
  const debt = rows.filter({ has: page.getByRole("link", { name: "INV-0000901", exact: true }) });
  await expect(debt).toContainText("123.45");
  await expect(page.getByRole("link", { name: "INV-0000999", exact: true })).toHaveCount(0);
  await expect(page.getByText("No saved invoices for this lease.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Invoice" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Lease history", { exact: true }).selectOption("historical");
  await page.getByLabel("Invoices", { exact: true }).selectOption("paid");
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveCount(0);
  await expect(page.getByText("Scheduled monthly rent")).toContainText("$1,000.00");
  await expect(rows.filter({ has: page.getByRole("link", { name: "INV-0000902", exact: true }) })).toContainText(
    "67.89",
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Invoices", { exact: true }).selectOption("void");
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(rows.filter({ has: page.getByRole("link", { name: "INV-0000903", exact: true }) })).toContainText(
    "Void",
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: "Clear Filters" }).click();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveAttribute(
    "href",
    /income\/invoices\/901/,
  );
});

test("recipient filter retains a former co-tenant's invoice without current lease membership", async ({ page }) => {
  await page.goto("/income?tenantId=12");
  await page.getByRole("button", { name: "Grouped By Unit" }).click();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toBeVisible();
  await expect(page.getByText("No saved invoices for this lease.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveCount(1);
  await page.goto("/income?tenantId=99");
  await expect(page.getByRole("link", { name: "INV-0000901", exact: true })).toHaveCount(0);
  await expect(page.getByText("No saved invoices or leases match these filters.")).toBeVisible();
});
