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

test("autosaves lease terms and resumes on the terms step", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  const residentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").first().click();
  await residentSave;
  const deposit = page.getByLabel("Security deposit");
  await deposit.fill("500");
  const billingSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await deposit.blur();
  await billingSave;
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lease terms" })).toBeVisible();

  const draftSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByText("Month-to-month", { exact: true }).click();
  await page.locator("#lease-rent-due-day").selectOption("15");
  await draftSave;

  await page.reload();
  await expect(page.getByRole("heading", { name: "Lease terms" })).toBeVisible();
  await expect(page.locator('[role="radio"][value="month_to_month"]')).toHaveAttribute("data-state", "checked");
  await expect(page.locator("#lease-rent-due-day")).toHaveValue("15");
});
