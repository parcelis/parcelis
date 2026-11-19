import { expect, test } from "./fixtures/authenticated";

test("unit rows include notice occupancy and overdue balances from historical leases", async ({ context, page }) => {
  const response = await page.request.get("/trpc/organizations.active");
  expect(response.ok()).toBe(true);
  const organization = (await response.json()).result.data;
  const noticeLease = {
    id: 12,
    unitId: 3,
    unitLabel: "101",
    status: "notice",
    monthlyRentCents: 100000,
    endsOn: null,
    amountOverdueCents: 2500,
  };
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const results = procedures.map((procedure) => {
      let data: unknown = [];
      if (procedure === "auth.me")
        data = {
          user: { id: 7, name: "Test manager", role: "property_manager" },
          permissions: Object.fromEntries(
            ["properties", "leases", "invoices", "units", "tenants", "maintenance"].map((resource) => [
              resource,
              { view: true },
            ]),
          ),
        };
      if (procedure === "organizations.active") data = organization;
      if (procedure === "properties.list")
        data = [
          {
            id: 2,
            name: "History House",
            city: "Austin",
            region: "TX",
            status: "active",
            unitCount: 2,
            occupiedUnits: 1,
            monthlyRentCents: 100000,
            amountOverdueCents: 19134,
            expiringLeases90Days: 0,
            openMaintenanceTickets: 0,
            maintenanceTickets: [],
            units: [
              { id: 3, name: "101" },
              { id: 4, name: "102" },
            ],
            leases: [noticeLease],
            leaseHistory: [
              noticeLease,
              { ...noticeLease, id: 11, status: "ended", amountOverdueCents: 9845 },
              { ...noticeLease, id: 10, unitId: 4, unitLabel: "102", status: "ended", amountOverdueCents: 6789 },
            ],
          },
        ];
      return { result: { data } };
    });
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });

  await page.goto("/properties");
  await expect(page.getByRole("link", { name: "Unit 101", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand History House units" }).click();
  const noticeUnit = page.locator("tr").filter({ has: page.getByRole("link", { name: /Unit 101/ }) });
  await expect(noticeUnit.getByRole("cell", { name: "100%", exact: true })).toBeVisible();
  await expect(noticeUnit).toContainText("$123.45");
  await expect(noticeUnit).toContainText("Notice");
  const vacantUnit = page.locator("tr").filter({ has: page.getByRole("link", { name: /Unit 102/ }) });
  await expect(vacantUnit.getByRole("cell", { name: "0%", exact: true })).toBeVisible();
  await expect(vacantUnit).toContainText("$67.89");
});

test("unit upcoming invoices show earliest due first and exclude paid, void, and past invoices", async ({
  context,
  page,
}) => {
  const response = await page.request.get("/trpc/organizations.active");
  const organization = (await response.json()).result.data;
  const invoice = {
    id: 901,
    invoiceNumber: 901,
    amountCents: 10000,
    balanceCents: 10000,
    status: "open",
    dueOn: "2099-03-01T00:00:00.000Z",
  };
  const lease = {
    id: 11,
    unitId: 3,
    unitLabel: "101",
    status: "ended",
    archivedAt: null,
    invoices: [
      invoice,
      { ...invoice, id: 902, invoiceNumber: 902, dueOn: "2099-01-01T00:00:00.000Z" },
      { ...invoice, id: 903, invoiceNumber: 903, status: "void" },
      { ...invoice, id: 904, invoiceNumber: 904, status: "paid", balanceCents: 0 },
      { ...invoice, id: 905, invoiceNumber: 905, dueOn: "2000-01-01T00:00:00.000Z" },
    ],
  };
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const results = procedures.map((procedure) => {
      let data: unknown = [];
      if (procedure === "auth.me")
        data = {
          user: { id: 7, role: "property_manager" },
          permissions: Object.fromEntries(
            ["properties", "units", "leases", "invoices"].map((resource) => [resource, { view: true }]),
          ),
        };
      if (procedure === "organizations.active") data = { ...organization, timeZone: "UTC" };
      if (procedure === "properties.byId")
        data = {
          id: 2,
          name: "History House",
          status: "active",
          line1: "123 Test Street",
          city: "Chicago",
          region: "IL",
          postalCode: "60601",
          tags: [],
          units: [
            { id: 3, name: "101", unitType: "Residential", marketRateCents: 10000, amenities: [], utilities: [] },
          ],
          leases: [],
          leaseHistory: [lease],
          maintenanceTickets: [],
        };
      return { result: { data } };
    });
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
  await page.goto("/properties/2/units/3");
  const upcoming = page.getByRole("heading", { name: "Upcoming Invoices", exact: true }).locator("..").locator("..");
  await expect(upcoming.getByText(/^INV-/)).toHaveText(["INV-0000902", "INV-0000901"]);
});
