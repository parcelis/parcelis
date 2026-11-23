import { test, expect } from "./fixtures/authenticated";

test("expanded unit occupancy includes notice leases and excludes non-occupying leases", async ({ page }) => {
  const response = await page.request.get("/trpc/properties.list");
  expect(response.ok()).toBe(true);
  const property = (await response.json()).result.data.find((item: { units: unknown[] }) => item.units.length > 0);
  expect(property, "A seeded property with units is required").toBeDefined();
  const statuses = ["active", "notice", "ended", "scheduled", "vacant"];
  const units = statuses.map((status, index) => ({
    ...property.units[0],
    id: 90001 + index,
    name: status,
  }));
  const leases = statuses
    .filter((status) => status !== "vacant")
    .map((status, index) => ({
      id: 90001 + index,
      unitId: units[index]!.id,
      unitLabel: status,
      status,
      endsOn: null,
      monthlyRentCents: 100000,
    }));
  await page.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    if (!procedures.includes("properties.list")) {
      await route.continue();
      return;
    }
    const fetched = await route.fetch();
    const payload = await fetched.json();
    const batched = url.searchParams.has("batch");
    const results = batched ? payload : [payload];
    procedures.forEach((procedure, index) => {
      if (procedure === "properties.list") {
        results[index] = {
          result: {
            data: [{ ...property, unitCount: units.length, occupiedUnits: 2, units, leases, leaseHistory: leases }],
          },
        };
      }
    });
    await route.fulfill({ response: fetched, json: batched ? results : results[0] });
  });
  await page.goto("/properties");
  await page.getByRole("button", { name: `Expand ${property.name} units`, exact: true }).click();
  for (const status of statuses) {
    const row = page.getByRole("row").filter({ has: page.getByText(`Unit ${status}`, { exact: true }) });
    await expect(
      row.getByRole("cell", { name: status === "active" || status === "notice" ? "100%" : "0%", exact: true }),
    ).toBeVisible();
  }
});

test("keeps the Properties hero and all five metrics within the viewport", async ({ page }) => {
  await page.goto("/properties");
  const heading = page.getByRole("heading", { name: "Portfolio directory", exact: true });
  await expect(heading).toBeVisible();
  const hero = heading.locator("../..");

  for (const width of [390, 768, 820, 834, 912, 1023, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1024 });
    await expect(async () => {
      const bounds = await hero.evaluate((element) => {
        const intro = element.children[0]!;
        const metrics = element.children[1]!;
        const heroBounds = element.getBoundingClientRect();
        const introBounds = intro.getBoundingClientRect();
        const metricBounds = metrics.getBoundingClientRect();
        return {
          pageFits: document.documentElement.scrollWidth <= window.innerWidth,
          cardCount: metrics.children.length,
          cardsFit: Array.from(metrics.children).every((card) => {
            const bounds = card.getBoundingClientRect();
            return (
              bounds.width > 0 &&
              bounds.left >= heroBounds.left &&
              bounds.right <= heroBounds.right &&
              bounds.left >= 0 &&
              bounds.right <= window.innerWidth &&
              card.scrollWidth <= card.clientWidth + 1
            );
          }),
          sideBySide: introBounds.right <= metricBounds.left && metricBounds.top < introBounds.bottom,
        };
      });
      expect(bounds.pageFits, `page overflow at ${width}px`).toBe(true);
      expect(bounds.cardCount).toBe(5);
      expect(bounds.cardsFit, `metric overflow at ${width}px`).toBe(true);
      if (width >= 1440) expect(bounds.sideBySide, `desktop layout at ${width}px`).toBe(true);
    }).toPass();
  }
});
