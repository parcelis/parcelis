import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/authenticated";
import { currencySettingsFixture } from "./fixtures/currency";

const settingsPath = "/settings/organization/general";
const yen = { code: "JPY", name: "Japanese Yen", minorUnitDigits: 0 };

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

async function mockedSettings(page: Page) {
  const read = async (procedure: string) => (await (await page.request.get(`/trpc/${procedure}`)).json()).result.data;
  const organization = await read("organizations.active");
  const auth = await read("auth.me");
  const second = {
    ...organization,
    id: organization.id + 10000,
    name: "Second currency workspace",
    slug: "currency-fixture-second",
  };
  const state = {
    organization,
    second,
    role: "owner",
    failSave: false,
    failCurrency: false,
    saveGate: null as Promise<void> | null,
    currencyGate: null as { slug: string; wait: Promise<void> } | null,
    currencies: {
      [organization.slug]: currencySettingsFixture(),
      [second.slug]: {
        ...currencySettingsFixture(),
        currencyCode: "JPY",
        supportedCurrencies: [yen],
      },
    },
    calls: [] as Array<{ procedure: string; slug: string; input: Record<string, unknown> }>,
  };
  await page.route("**/trpc/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const procedures = decodeURIComponent(url.pathname.split("/trpc/")[1]!).split(",");
    const batched = url.searchParams.has("batch");
    const input =
      request.method() === "POST" ? request.postDataJSON() : JSON.parse(url.searchParams.get("input") ?? "{}");
    const slug = request.headers()["x-parcelis-organization-slug"] ?? organization.slug;
    const active = slug === second.slug ? second : organization;
    const results = await Promise.all(
      procedures.map(async (procedure, index) => {
        const args = (batched ? input[index] : input) ?? {};
        state.calls.push({ procedure, slug, input: args });
        const error = (message: string, code = "CONFLICT") => ({
          error: { message, code: -32009, data: { code, httpStatus: 409, path: procedure } },
        });
        let data: unknown = [];
        if (procedure === "auth.me") data = auth;
        if (procedure === "organizations.active") data = { ...active, role: state.role };
        if (procedure === "organizations.list")
          data = [organization, second].map((organization) => ({ organization, role: state.role }));
        if (procedure === "organizations.currency") {
          if (state.currencyGate?.slug === slug) await state.currencyGate.wait;
          if (state.failCurrency) return error("Currency unavailable.", "INTERNAL_SERVER_ERROR");
          data = { ...state.currencies[slug] };
        }
        if (procedure === "organizations.update") {
          if (state.saveGate) await state.saveGate;
          if (state.failSave) {
            state.currencies[slug] = {
              ...state.currencies[slug]!,
              currencyLockedAt: new Date().toISOString(),
              canChangeCurrency: false,
              restrictionReason: "monetary_data_saved",
            };
            return error("Currency cannot be changed after monetary data has been saved.");
          }
          Object.assign(active, args);
          if (args.currencyCode) state.currencies[slug]!.currencyCode = String(args.currencyCode);
          data = active;
        }
        return { result: { data } };
      }),
    );
    await route.fulfill({ json: batched ? results : results[0] });
  });
  return state;
}

test("shows the default server currency without requiring a selection", async ({ page }) => {
  await mockedSettings(page);
  await page.goto(settingsPath);
  const currency = page.getByRole("textbox", { name: "Currency", exact: true });
  await expect(currency).toHaveValue("USD — US Dollar");
  await expect(currency).toHaveAttribute("readonly", "");
  await expect(page.getByText(/This is the only supported currency/)).toBeVisible();
  await page.screenshot({ path: "/tmp/parcelis-617-default.png", fullPage: true });
});

test("redirects organization settings to General within the current organization", async ({ page }) => {
  const state = await mockedSettings(page);
  const organizationPath = `/o/${state.organization.slug}`;
  await page.context().addCookies([
    { name: "parcelis-organization-slug", value: "stale-organization", url: page.url() },
  ]);
  const response = await page.request.get(`${organizationPath}/settings/organization`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location!, response.url()).pathname).toBe(`${organizationPath}${settingsPath}`);
  await page.goto(`${organizationPath}/settings/organization`);
  await expect(page).toHaveURL(`/o/${state.organization.slug}${settingsPath}`);
  await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("USD — US Dollar");
});

test("members and permanently locked organizations see read-only saved currency", async ({ page }) => {
  const state = await mockedSettings(page);
  state.role = "member";
  state.currencies[state.organization.slug]!.canChangeCurrency = false;
  state.currencies[state.organization.slug]!.restrictionReason = "insufficient_permissions";
  await page.goto(settingsPath);
  await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("USD — US Dollar");
  await expect(page.getByRole("button", { name: "Update organization", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Only organization owners and administrators can change currency/)).toBeVisible();
  state.role = "owner";
  state.currencies[state.organization.slug] = {
    ...currencySettingsFixture(),
    canChangeCurrency: false,
    restrictionReason: "monetary_data_saved",
    currencyLockedAt: new Date().toISOString(),
  };
  await page.reload();
  await expect(page.getByText("Currency cannot be changed because monetary records already use it.")).toBeVisible();
  await page.screenshot({ path: "/tmp/parcelis-617-locked.png", fullPage: true });
});

test("a stale eligibility rejection preserves settings and the saved currency", async ({ page }) => {
  const state = await mockedSettings(page);
  state.currencies[state.organization.slug]!.supportedCurrencies.push(yen);
  await page.goto(settingsPath);
  await page.getByRole("textbox", { name: "Organization name", exact: true }).fill("Retain this name");
  await page.getByRole("combobox", { name: "Currency", exact: true }).selectOption("JPY");
  const gate = deferred();
  state.saveGate = gate.wait;
  state.failSave = true;
  try {
    await page.getByRole("button", { name: "Update organization", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Currency", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Saving organization…" })).toBeVisible();
    gate.release();
    await expect(page.getByRole("alert").filter({ hasText: /Currency/ })).toContainText(
      "Currency cannot be changed after monetary data has been saved.",
    );
    await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).toHaveValue("Retain this name");
    await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("USD — US Dollar");
    await page.getByRole("button", { name: "Update organization", exact: true }).click();
    await expect.poll(() => state.calls.filter((call) => call.procedure === "organizations.update").length).toBe(2);
    expect(state.calls.filter((call) => call.procedure === "organizations.update")[1]!.input).not.toHaveProperty(
      "currencyCode",
    );
  } finally {
    gate.release();
  }
});

test("a successful save refreshes currency consumers using server precision", async ({ page }) => {
  const state = await mockedSettings(page);
  state.currencies[state.organization.slug]!.supportedCurrencies.push(yen);
  await page.goto(settingsPath);
  await page.getByRole("combobox", { name: "Currency", exact: true }).selectOption("JPY");
  await page.getByRole("button", { name: "Update organization", exact: true }).click();
  await expect(page.getByText("Organization has been updated.", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Currency", exact: true })).toHaveValue("JPY");
  await page.getByRole("main").getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(page.getByText("¥18,422,000 JPY", { exact: true })).toBeVisible();
});

test("organization switching discards a delayed previous currency response", async ({ page }) => {
  const state = await mockedSettings(page);
  const gate = deferred();
  state.currencyGate = { slug: state.organization.slug, wait: gate.wait };
  try {
    await page.goto(settingsPath);
    await expect(page.getByText("Loading organization currency…", { exact: true })).toBeVisible();
    await page.evaluate((path) => window.history.pushState(null, "", path), `/o/${state.second.slug}${settingsPath}`);
    await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("JPY — Japanese Yen");
    gate.release();
    await expect(page.getByRole("textbox", { name: "Organization name", exact: true })).toHaveValue(state.second.name);
    await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("JPY — Japanese Yen");
  } finally {
    gate.release();
  }
});

test("currency loading errors offer a retry without showing an assumed currency", async ({ page }) => {
  const state = await mockedSettings(page);
  state.failCurrency = true;
  await page.goto(settingsPath);
  await expect(page.getByRole("alert").filter({ hasText: /Currency/ })).toContainText("Currency unavailable.");
  await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveCount(0);
  state.failCurrency = false;
  await page.getByRole("button", { name: "Retry loading currency" }).click();
  await expect(page.getByRole("textbox", { name: "Currency", exact: true })).toHaveValue("USD — US Dollar");
});
