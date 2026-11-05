import { test, expect } from "./fixtures/authenticated";
import type { Page } from "@playwright/test";
import { version } from "../../apps/web/package.json";

async function openReport(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  }
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Report a problem", exact: true })).toBeVisible();
  const items = page.getByRole("menuitem");
  const labels = await items.allTextContents();
  expect(labels.findIndex((value) => value.includes("Report a problem"))).toBe(
    labels.findIndex((value) => value.includes("Request a feature")) + 1,
  );
  await page.getByRole("menuitem", { name: "Report a problem", exact: true }).click();
  return page.getByRole("dialog", { name: "Report a problem", exact: true });
}

for (const [width, theme] of [
  [1440, "light"],
  [390, "light"],
  [390, "dark"],
] as const) {
  test(`reviews optional data and preserves a failed report before retry at ${width}px in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => window.localStorage.setItem("parcelis-theme", theme), theme);
    await page.goto("/?private=secret#private");
    if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
    let attempts = 0;
    const bodies: string[] = [];
    await page.route("**/trpc/bugReports.submit*", async (route) => {
      attempts++;
      bodies.push(route.request().postData() ?? "");
      await route.fulfill(
        attempts === 1
          ? {
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                error: {
                  message: "Your report could not be sent. Try again.",
                  code: -32603,
                  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                },
              }),
            }
          : {
              contentType: "application/json",
              body: JSON.stringify({ result: { data: { sent: true } } }),
            },
      );
    });
    const drawer = await openReport(page);
    const currentPage = new URL(page.url());
    const expectedPageUrl = `${currentPage.origin}${currentPage.pathname}`;
    const expectedBrowser = await page.evaluate(() => navigator.userAgent);
    await expect(drawer.getByRole("checkbox", { name: "Include page URL" })).not.toBeChecked();
    await expect(drawer.getByRole("checkbox", { name: "Include browser / app version" })).not.toBeChecked();
    await expect(drawer.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await drawer.getByRole("textbox", { name: "Description (required)" }).fill("The save button stopped responding.");
    await drawer.getByRole("checkbox", { name: "Include page URL" }).check();
    await drawer.getByRole("checkbox", { name: "Include browser / app version" }).check();
    await drawer.getByLabel("Screenshots (optional)", { exact: true }).setInputFiles({
      name: "private-original-name.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review your report", exact: true });
    await expect(review.getByText("The save button stopped responding.", { exact: true })).toBeVisible();
    await expect(review.getByText("support@parcelis.dev", { exact: true })).toBeVisible();
    await expect(review.getByText(expectedPageUrl, { exact: true })).toBeVisible();
    await expect(review.getByText(expectedBrowser, { exact: true })).toBeVisible();
    await expect(review.getByText(`Parcelis ${version}`, { exact: true })).toBeVisible();
    await expect(review.getByRole("img", { name: "Screenshot 1 preview" })).toBeVisible();
    expect(await review.innerText()).not.toContain("?private=");
    expect(await review.innerText()).not.toContain("#private");
    expect(attempts).toBe(0);
    const bounds = await review.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await review.screenshot({ path: `/tmp/parcelis-bug-report-${width}-${theme}.png` });
    await review.getByRole("button", { name: "Send report", exact: true }).click();
    await expect(review.getByRole("alert")).toContainText("Try again");
    await expect(review.getByRole("img", { name: "Screenshot 1 preview" })).toBeVisible();
    await review.getByRole("button", { name: "Back", exact: true }).click();
    await expect(drawer.getByRole("textbox", { name: "Description (required)" })).toHaveValue(
      "The save button stopped responding.",
    );
    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    await review.getByRole("button", { name: "Send report", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Report sent", exact: true }).getByRole("status")).toContainText(
      "support@parcelis.dev",
    );
    expect(attempts).toBe(2);
    const normalizeBoundary = (body: string) => body.replaceAll(body.split("\r\n")[0]!, "--boundary");
    expect(normalizeBoundary(bodies[0]!)).toEqual(normalizeBoundary(bodies[1]!));
    expect(bodies[0]).not.toContain("secret");
    expect(bodies[0]).not.toContain("private-original-name");
    expect(bodies[0]).toContain(expectedPageUrl);
    expect(bodies[0]).toContain(expectedBrowser);
    expect(bodies[0]).toContain(version);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const fresh = await openReport(page);
    await expect(fresh.getByRole("textbox", { name: "Description (required)" })).toHaveValue("");
    await expect(fresh.getByRole("checkbox", { name: "Include page URL" })).not.toBeChecked();
  });
}

test("sends a minimal report without optional context", async ({ page }) => {
  let submitted = "";
  await page.route("**/trpc/bugReports.submit*", async (route) => {
    submitted = route.request().postData() ?? "";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ result: { data: { sent: true } } }),
    });
  });
  const drawer = await openReport(page);
  await drawer.getByRole("textbox", { name: "Description (required)" }).fill("A button is broken.");
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Report sent", exact: true })).toBeVisible();
  expect(submitted).toContain('name="description"');
  for (const field of ["pageUrl", "browserVersion", "appVersion", "screenshots"])
    expect(submitted).not.toContain(`name="${field}"`);
});

test("rejects unsupported, oversized and excess screenshots before submission", async ({ page }) => {
  const drawer = await openReport(page);
  await expect(drawer.getByRole("button", { name: "Add screenshots", exact: true })).toHaveAccessibleDescription(
    "Choose up to three PNG, JPEG, or WebP images, no larger than 5 MB each.",
  );
  const picker = drawer.getByLabel("Screenshots (optional)", { exact: true });
  await picker.setInputFiles({ name: "unsupported.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg />") });
  await expect(drawer.getByRole("alert")).toContainText("PNG, JPEG, or WebP");
  await picker.setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(drawer.getByRole("alert")).toContainText("5 MB");
  const png = {
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  };
  await picker.setInputFiles([png, png, png, png]);
  await expect(drawer.getByRole("alert")).toContainText("three");
  await picker.setInputFiles([png, png, png]);
  await expect(drawer.getByRole("img")).toHaveCount(3);
  await expect(picker).toBeDisabled();
  await drawer.getByRole("button", { name: "Remove screenshot 1", exact: true }).click();
  await expect(picker).toBeEnabled();
  await expect(drawer.getByRole("img")).toHaveCount(2);
});

test("clears stale context and errors on close while retaining the report draft", async ({ page }) => {
  const drawer = await openReport(page);
  await drawer.getByRole("textbox", { name: "Description (required)" }).fill("Keep this draft for retry.");
  await drawer.getByRole("checkbox", { name: "Include page URL" }).check();
  await drawer.getByRole("checkbox", { name: "Include browser / app version" }).check();
  await drawer.getByLabel("Screenshots (optional)", { exact: true }).setInputFiles({
    name: "unsupported.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg />"),
  });
  await expect(drawer.getByRole("alert")).toBeVisible();
  await drawer.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "Leases", exact: true }).click();
  await expect(page).toHaveURL(/\/leases$/);
  const reopened = await openReport(page);
  await expect(reopened.getByRole("textbox", { name: "Description (required)" })).toHaveValue(
    "Keep this draft for retry.",
  );
  await expect(reopened.getByRole("checkbox", { name: "Include page URL" })).not.toBeChecked();
  await expect(reopened.getByRole("checkbox", { name: "Include browser / app version" })).not.toBeChecked();
  await expect(reopened.getByRole("alert")).toHaveCount(0);
  await reopened.getByRole("checkbox", { name: "Include page URL" }).check();
  const url = new URL(page.url());
  await expect(reopened.getByText(`${url.origin}${url.pathname}`, { exact: true })).toBeVisible();
});
