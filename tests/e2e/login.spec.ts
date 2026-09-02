import { expect, test } from "@playwright/test";

test("loads the sign-in page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("opens the password-reset request form", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Forgot your password?" }).click();

  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
});

test("opens the new-password form from a reset link", async ({ page }) => {
  await page.goto("/login?mode=reset&token=preview-token");

  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "New password", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Confirm new password", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password" })).toBeVisible();
});
