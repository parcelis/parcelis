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
const invoice = {
  id: 901,
  invoiceNumber: 901,
  amountCents: 12345,
  balanceCents: 12345,
  dueOn: "2020-01-01T00:00:00.000Z",
  periodStartsOn: "2020-01-01T00:00:00.000Z",
  periodEndsOn: "2020-01-31T00:00:00.000Z",
  createdAt: "2020-01-01T00:00:00.000Z",
  status: "overdue",
  paidOn: null,
  paidByTenantId: null,
  paymentMethod: null,
  items: [],
  property: { id: 2, name: "History House" },
  tenant,
  recipients: [{ tenant }],
  lease: { unitLabel: "101", startsOn: "2020-01-01T00:00:00.000Z", endsOn: null },
};

async function mockQueries(context: BrowserContext, resultFor: (procedure: string) => unknown | Promise<unknown>) {
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const results = await Promise.all(procedures.map(resultFor));
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
}

for (const reversedAt of [null, "2020-01-03T00:00:00.000Z"]) {
  test(`delete explanation is persistent with ${reversedAt ? "reversed" : "recorded"} payments`, async ({
    context,
    page,
  }) => {
    await mockQueries(context, (procedure) => {
      let data: unknown = [];
      if (procedure === "auth.me") data = user;
      if (procedure === "organizations.active") data = null;
      if (procedure === "invoices.byId")
        data = {
          ...invoice,
          payments: [
            {
              id: 1,
              tenant,
              amountCents: 12345,
              paidOn: "2020-01-02T00:00:00.000Z",
              paymentMethod: "cash",
              reversedAt,
            },
          ],
        };
      return { result: { data } };
    });
    await page.goto("/income/invoices/901");
    const explanation = "Invoices with payment history cannot be deleted, even when all payments have been reversed.";
    const deleteButton = page.getByRole("button", { name: "Delete", exact: true });
    await expect(deleteButton).toBeDisabled();
    await expect(page.getByText(explanation, { exact: true })).toBeVisible();
    await expect(deleteButton).toHaveAccessibleDescription(explanation);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
}
