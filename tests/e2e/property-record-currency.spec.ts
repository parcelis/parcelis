import type { apiClient } from "../../apps/web/components/api-client";
import { test, expect } from "./fixtures/authenticated";
import { currencySettingsFixture } from "./fixtures/currency";

type Property = NonNullable<Awaited<ReturnType<typeof apiClient.properties.byId.query>>>;

test("property lease amounts retain their saved currency when the workspace currency differs", async ({ page }) => {
  const listResponse = await page.request.get("/trpc/properties.list");
  expect(listResponse.ok()).toBe(true);
  const list = (await listResponse.json()) as {
    result: { data: Array<{ id: number; leases: Array<{ id: number }> }> };
  };
  const id = list.result.data.find((property) => property.leases.length > 0)?.id;
  expect(id, "A seeded property with a lease is required").toBeDefined();
  const propertyResponse = await page.request.get("/trpc/properties.byId", {
    params: { input: JSON.stringify({ id }) },
  });
  expect(propertyResponse.ok()).toBe(true);
  const {
    result: { data: property },
  } = (await propertyResponse.json()) as { result: { data: Property } };
  expect(property.leases.length).toBeGreaterThan(0);
  property.leases = [{ ...property.leases[0]!, currencyCode: "USD", monthlyRentCents: 1234, amountOverdueCents: 567 }];

  await page.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    if (!procedures.some((procedure) => ["properties.byId", "organizations.currency"].includes(procedure))) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json();
    const batched = url.searchParams.has("batch");
    const results = batched ? payload : [payload];
    procedures.forEach((procedure, index) => {
      if (procedure === "properties.byId") results[index] = { result: { data: property } };
      if (procedure === "organizations.currency") {
        results[index] = {
          result: {
            data: {
              ...currencySettingsFixture(),
              currencyCode: "JPY",
              supportedCurrencies: [{ code: "JPY", name: "Japanese Yen", minorUnitDigits: 0 }],
            },
          },
        };
      }
    });
    await route.fulfill({ response, json: batched ? results : results[0] });
  });

  await page.goto(`/properties/${id}`);
  await expect(page.getByText("$12.34 USD", { exact: true })).toBeVisible();
  await expect(page.getByText("Overdue $5.67 USD", { exact: true })).toBeVisible();
});
