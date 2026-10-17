import { expect, test } from "@playwright/test";
import { authenticationUnavailableMessage } from "../../packages/schemas/src/index";

test("an unavailable authentication service shows an inline error without leaving login", async ({ page }) => {
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ status: 503, json: { error: authenticationUnavailableMessage } }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveAttribute("type", "text");
  await page.getByRole("textbox", { name: "Email address" }).fill("person@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: authenticationUnavailableMessage })).toHaveText(
    authenticationUnavailableMessage,
  );
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("a returned authentication error shows a message on the login page", async ({ page }) => {
  await page.goto("/login?error=Configuration");
  await expect(page.getByRole("alert").filter({ hasText: authenticationUnavailableMessage })).toHaveText(
    authenticationUnavailableMessage,
  );
});
