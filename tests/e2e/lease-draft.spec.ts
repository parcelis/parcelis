import { expect, test } from "./fixtures/authenticated";

test("opens the lease wizard for an authenticated user", async ({ page }) => {
  await page.goto("/leases/new");

  await expect(page.getByRole("heading", { name: "Create a lease" })).toBeVisible();
  await expect(page.getByText("Choose the property and unit")).toBeVisible();
});

test("creates a resumable draft after selecting a unit", async ({ page }) => {
  await page.goto("/leases/new");

  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const unit = page.locator('input[name="lease-unit"]:not(:disabled)').first();
  await expect(unit).toBeVisible();
  await unit.check();

  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
  await page.reload();
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await expect(unit).toBeChecked();
});

test("autosaves a resident selection", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  const resident = page.getByRole("checkbox").first();
  await expect(resident).toBeVisible();
  const draftSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await resident.click();
  await draftSave;

  await page.reload();
  await expect(resident).toBeChecked();
});
