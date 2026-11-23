import { expect, test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const email = process.env.SEED_ADMIN_EMAIL ?? "admin@parcelis.dev";
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error("SEED_ADMIN_PASSWORD is required for authenticated browser tests.");

    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    const organizationResponse = await page.request.get("/trpc/organizations.active");
    expect(organizationResponse.ok()).toBe(true);
    const {
      result: { data: organization },
    } = (await organizationResponse.json()) as { result: { data: { slug: string } } };
    await page
      .context()
      .addCookies([{ name: "parcelis-organization-slug", value: organization.slug, url: page.url() }]);
    await use(page);
  },
});

export { expect } from "@playwright/test";
