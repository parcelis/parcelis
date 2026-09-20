import { expect, test } from "./fixtures/authenticated";

test("opens the lease wizard for an authenticated user", async ({ page }) => {
  await page.goto("/leases/new");

  await expect(page.getByRole("heading", { name: "Create a lease" })).toBeVisible();
  await expect(page.getByText("Choose the property and unit")).toBeVisible();
});
