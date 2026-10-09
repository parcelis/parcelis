import { createRequire } from "node:module";
import { resolve } from "node:path";
const nextAuthCookieName = process.env.NEXTAUTH_URL?.startsWith("https://")
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";
import { expect, test } from "@playwright/test";

const { encode } = createRequire(resolve(__dirname, "../../apps/web/package.json"))("next-auth/jwt");

async function mockAuthentication(context: import("@playwright/test").BrowserContext, authenticated: boolean) {
  let signedIn = authenticated;
  if (authenticated) {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret?.trim()) throw new Error("NEXTAUTH_SECRET is required for JWT browser tests.");
    const baseURL = test.info().project.use.baseURL!;
    await context.addCookies([
      { name: nextAuthCookieName, value: await encode({ token: { sub: "7" }, secret }), url: baseURL },
    ]);
  }
  const user = { id: 7, name: "JWT User", email: "jwt@example.test", role: "property_manager" };
  await context.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: signedIn ? { user, expires: new Date(Date.now() + 604_800_000).toISOString() } : null,
    }),
  );
  await context.route("**/api/auth/csrf", (route) => route.fulfill({ json: { csrfToken: "test-csrf" } }));
  await context.route("**/api/auth/signout", async (route) => {
    expect(new URLSearchParams(route.request().postData() ?? "").get("csrfToken")).toBe("test-csrf");
    signedIn = false;
    await context.clearCookies({ name: nextAuthCookieName });
    await route.fulfill({ json: { url: "/login" } });
  });
  await context.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const results = procedures.map((procedure) => ({
      result: {
        data: procedure === "auth.me" ? { user, permissions: {} } : procedure === "organizations.active" ? null : [],
      },
    }));
    await route.fulfill({ json: url.searchParams.has("batch") ? results : results[0] });
  });
}

test("NextAuth redirects unauthenticated workspace visits to login", async ({ page, context }) => {
  await mockAuthentication(context, false);
  await page.goto("/settings/jobs");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("NextAuth sign-out redirects every open workspace tab", async ({ page, context }) => {
  await mockAuthentication(context, true);
  await page.goto("/settings/jobs");
  await expect(page.getByText("Administrator access is required.")).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.goto("/settings/jobs");
  await expect(otherTab.getByText("Administrator access is required.")).toBeVisible();
  await page.bringToFront();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(otherTab).toHaveURL(/\/login(?:\?|$)/);
});

test("password reset signs out through NextAuth", async ({ page, context }) => {
  await mockAuthentication(context, true);
  await page.route("**/trpc/auth.resetPassword*", (route) =>
    route.fulfill({ json: [{ result: { data: { success: true } } }] }),
  );
  await page.goto("/login?mode=reset#token=test-reset-token");
  await page.getByLabel("New password", { exact: true }).fill("Replacement-password-123!");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Replacement-password-123!");
  const signedOut = page.waitForRequest(
    (request) => request.url().endsWith("/api/auth/signout") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await signedOut;
  await expect(page.getByText("Your password has been reset. Sign in with your new password.")).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === nextAuthCookieName)).toBe(false);
});
