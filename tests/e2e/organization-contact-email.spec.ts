import { test, expect } from "./fixtures/authenticated";

test("locks contact email while saving and keeps the draft when saving fails", async ({ page }) => {
  await page.goto("/settings/organization");
  await expect(page).toHaveURL(/\/o\/[^/]+\/settings\/organization$/);
  await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).not.toHaveValue("");
  const email = page.getByRole("textbox", { name: "Organization email address (optional)", exact: true });
  const save = page.getByRole("button", { name: "Update organization", exact: true });
  await expect(email).toBeEnabled();
  await email.fill("billing&ops@example.com");
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);

  let releaseSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/trpc/organizations.update*", async (route) => {
    await pendingSave;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify([
        {
          error: {
            message: "The organization could not be saved. Try again.",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "organizations.update" },
          },
        },
      ]),
    });
  });

  try {
    await save.click();
    await expect(save).toBeDisabled();
    await expect(email).toBeDisabled();
    releaseSave();
    await expect(email).toBeEnabled();
    await expect(email).toHaveValue("billing&ops@example.com");
    await expect(page.getByText("The organization could not be saved. Try again.", { exact: true })).toBeVisible();
  } finally {
    releaseSave();
  }
});
