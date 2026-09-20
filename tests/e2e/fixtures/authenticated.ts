import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const email = process.env.SEED_ADMIN_EMAIL ?? "admin@parcelis.dev";
    const password = process.env.SEED_ADMIN_PASSWORD;
    test.skip(!password, "SEED_ADMIN_PASSWORD is required for authenticated browser tests.");

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await use(page);
  },
});

export { expect } from "@playwright/test";
