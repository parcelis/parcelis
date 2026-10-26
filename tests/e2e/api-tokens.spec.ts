import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/authenticated";

const routePath = "/settings/organization/api-tokens";
const secret = `pcls_api_${"X".repeat(43)}`;
type Metadata = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdByLabel: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByLabel: string | null;
};

function metadata(index: number, name = `Integration ${index}`): Metadata {
  return {
    id: `c${String(index).padStart(24, "0")}`,
    name,
    tokenPrefix: "pcls_api_XXXXXXXXXX",
    createdByLabel: "Token owner",
    createdAt: "2026-01-01T12:00:00Z",
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    revokedByLabel: null,
  };
}

async function read<T>(page: Page, procedure: string): Promise<T> {
  const response = await page.request.get(`/trpc/${procedure}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).result.data;
}

async function mockedTokens(page: Page, rows: Metadata[] = []) {
  const organization = await read<{ id: number; slug: string; name: string; role: string }>(
    page,
    "organizations.active",
  );
  const auth = await read<{ user: { role: string }; permissions: Record<string, unknown> }>(page, "auth.me");
  const second = {
    ...organization,
    id: organization.id + 10000,
    slug: "api-token-browser-secondary",
    name: "Second organization",
  };
  const state = {
    organization,
    second,
    role: "owner",
    rows: { [organization.slug]: rows, [second.slug]: [metadata(999, "Second organization token")] },
    failList: false,
    failCreate: false,
    failRevoke: false,
    createGate: null as Promise<void> | null,
    listGate: null as { slug: string; wait: Promise<void> } | null,
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
        let data: unknown;
        const error = (message: string) => ({
          error: { message, code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: procedure } },
        });
        if (procedure === "auth.me")
          data = {
            ...auth,
            user: { ...auth.user, role: state.role === "member" ? "property_manager" : auth.user.role },
          };
        else if (procedure === "organizations.active") data = { ...active, role: state.role };
        else if (procedure === "organizations.list")
          data = [organization, second].map((organization) => ({ organization, role: state.role }));
        else if (procedure === "apiTokens.list") {
          if (state.failList) return error("Token list unavailable.");
          const records = state.rows[slug] ?? [];
          const start = args.cursor ? records.findIndex((row) => row.id === args.cursor) + 1 : 0;
          const items = records.slice(start, start + 25).map((row) => ({ ...row }));
          data = { items, nextCursor: start + 25 < records.length ? items.at(-1)!.id : null };
          if (state.listGate?.slug === slug) await state.listGate.wait;
        } else if (procedure === "apiTokens.create") {
          if (state.createGate) await state.createGate;
          if (state.failCreate) return error("Creation unavailable.");
          const row = metadata(1000 + state.calls.length, String(args.name));
          state.rows[slug] = [row, ...(state.rows[slug] ?? [])];
          data = { metadata: row, token: secret };
        } else if (procedure === "apiTokens.revoke") {
          if (state.failRevoke) return error("Revocation unavailable.");
          const row = state.rows[slug]?.find((row) => row.id === args.id);
          if (!row) return error("Token not found.");
          row.revokedAt = new Date().toISOString();
          row.revokedByLabel = "Administrator";
          data = row;
        } else data = [];
        return { result: { data } };
      }),
    );
    await route.fulfill({ json: batched ? results : results[0] });
  });
  return state;
}

function drawer(page: Page) {
  return page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Create API token", exact: true }) });
}

async function openCreate(page: Page, name: string) {
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await drawer(page).getByRole("textbox", { name: "Name", exact: true }).fill(name);
}

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

async function switchPath(page: Page, slug: string) {
  await page.evaluate((path) => window.history.pushState(null, "", path), `/o/${slug}${routePath}`);
}

test.describe.configure({ mode: "default" });
test.use({ actionTimeout: 15000 });

test("creates, copies once, and revokes a real token while a second token stays valid", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(90000);
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Writes require a local app.");
  const organization = await read<{ id: number; slug: string }>(page, "organizations.active");
  const ids: string[] = [];
  const apiOrigin = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:40010";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  try {
    await page.goto(`/o/${organization.slug}${routePath}`);
    const tokens: string[] = [];
    const names = [`Browser token ${randomUUID().slice(0, 8)}`, `Browser token ${randomUUID().slice(0, 8)}`];
    for (const name of names) {
      await openCreate(page, name);
      await expect(drawer(page).getByLabel("Expiration", { exact: true })).toHaveValue("7_days");
      const response = page.waitForResponse(
        (response) => response.url().includes("apiTokens.create") && response.request().method() === "POST",
      );
      await drawer(page).getByRole("button", { name: "Create token", exact: true }).click();
      const payload = await (await response).json();
      expect(payload[0].error?.message).toBeUndefined();
      ids.push(payload[0].result.data.metadata.id);
      const dialog = page.getByRole("dialog", { name: "Copy your API token" });
      await expect(dialog).toBeVisible();
      const token = await dialog.getByLabel("API token", { exact: true }).inputValue();
      expect(token).toMatch(/^pcls_api_[A-Za-z0-9_-]{43}$/);
      tokens.push(token);
      await dialog.getByRole("button", { name: "Copy", exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);
      expect(
        await page.evaluate(() =>
          JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href }),
        ),
      ).not.toContain(token);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Copy your API token" })).toBeHidden();
    expect((await request.storageState()).cookies).toEqual([]);
    for (const token of tokens)
      expect(
        (await request.get(`${apiOrigin}/api/v1/properties`, { headers: { authorization: `Bearer ${token}` } })).status(),
      ).toBe(200);
    await page.getByRole("button", { name: `Revoke ${names[0]}`, exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Revoke API token?" });
    await expect(confirmation).toContainText(names[0]!);
    await confirmation.getByRole("button", { name: "Revoke token", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: names[0]! })).toContainText("Revoked");
    expect(
      (await request.get(`${apiOrigin}/api/v1/properties`, { headers: { authorization: `Bearer ${tokens[0]}` } })).status(),
    ).toBe(401);
    expect(
      (await request.get(`${apiOrigin}/api/v1/properties`, { headers: { authorization: `Bearer ${tokens[1]}` } })).status(),
    ).toBe(200);
  } finally {
    for (const id of ids) {
      const response = await page.request.post("/trpc/apiTokens.revoke?batch=1", {
        headers: { "x-parcelis-organization-slug": organization.slug },
        data: { "0": { id } },
      });
      expect(response.ok()).toBe(true);
    }
  }
});

test("paginates metadata and derives active, expired, and revoked statuses", async ({ page }) => {
  const rows = Array.from({ length: 26 }, (_, index) => metadata(index + 1));
  rows[1]!.expiresAt = "2020-01-01T00:00:00Z";
  rows[2]!.revokedAt = "2020-01-01T00:00:00Z";
  rows[2]!.expiresAt = "2020-01-01T00:00:00Z";
  const state = await mockedTokens(page, rows);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await expect(page.getByRole("row").filter({ hasText: "Integration 1", hasNotText: /Integration 1\d/ })).toContainText(
    "Active",
  );
  await expect(page.getByRole("row").filter({ hasText: "Integration 2", hasNotText: /Integration 2\d/ })).toContainText(
    "Expired",
  );
  const revoked = page.getByRole("row").filter({ hasText: "Integration 3", hasNotText: /Integration 3\d/ });
  await expect(revoked).toContainText("Revoked");
  await expect(revoked.getByRole("button")).toHaveCount(0);
  const navigation = page.getByRole("navigation", { name: "API token pagination" });
  await expect(navigation.getByRole("button", { name: "Previous" })).toBeDisabled();
  await navigation.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Integration 26", { exact: true })).toBeVisible();
  await expect(navigation).toContainText("Page 2");
  await expect(navigation.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(state.calls.filter((call) => call.procedure === "apiTokens.list").at(-1)?.input.cursor).toBe(rows[24]!.id);
  await navigation.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByText("Integration 1", { exact: true })).toBeVisible();
});

test("updates expiration status while the page stays open", async ({ page }) => {
  const now = new Date("2026-10-22T12:00:00Z");
  await page.clock.install({ time: now });
  const row = metadata(1, "Expiring integration");
  row.expiresAt = new Date(now.getTime() + 60_000).toISOString();
  const state = await mockedTokens(page, [row]);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  const token = page.getByRole("row").filter({ hasText: "Expiring integration" });
  await expect(token).toContainText("Active");
  await page.clock.fastForward(60_001);
  await expect(token).toContainText("Expired");
});

for (const role of ["owner", "administrator", "member"]) {
  test(`token settings enforce ${role} access for navigation and direct visits`, async ({ page }) => {
    const state = await mockedTokens(page);
    state.role = role;
    await page.goto(`/o/${state.organization.slug}${routePath}`);
    if (role === "member") {
      await expect(
        page.getByRole("alert").filter({ hasText: "Organization owner or administrator access is required." }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "API tokens", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Create token", exact: true })).toHaveCount(0);
      expect(state.calls.some((call) => call.procedure.startsWith("apiTokens."))).toBe(false);
    } else {
      await expect(page.getByRole("link", { name: "API tokens", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: "Create token", exact: true })).toBeVisible();
    }
  });
}

test("validates creation, blocks duplicate submissions, and clears the secret on dismissal", async ({ page }) => {
  const state = await mockedTokens(page);
  const gate = deferred();
  state.createGate = gate.wait;
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await openCreate(page, "   ");
  const create = drawer(page).getByRole("button", { name: "Create token", exact: true });
  await expect(create).toBeDisabled();
  await drawer(page).getByLabel("Name", { exact: true }).fill("  Bruno  ");
  await create.click();
  await expect(drawer(page).getByRole("button", { name: "Creating…", exact: true })).toBeDisabled();
  await drawer(page)
    .locator("form")
    .evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
    });
  await expect.poll(() => state.calls.filter((call) => call.procedure === "apiTokens.create").length).toBe(1);
  gate.release();
  const dialog = page.getByRole("dialog", { name: "Copy your API token" });
  await expect(dialog).toBeVisible();
  expect(state.calls.find((call) => call.procedure === "apiTokens.create")?.input).toEqual({
    name: "Bruno",
    expiration: "7_days",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#created-api-token")).toHaveCount(0);
  await page.reload();
  await expect(dialog).toBeHidden();
});

test("shows safe copy failure feedback while preserving manual copying", async ({ page }) => {
  const state = await mockedTokens(page);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await openCreate(page, "Copy fallback");
  await drawer(page).getByRole("button", { name: "Create token", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Copy your API token" });
  await expect(dialog).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Permission denied.");
        },
      },
    }),
  );
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByText("Couldn’t copy the token. Select it and copy it manually.")).toBeVisible();
  await expect(dialog.getByLabel("API token", { exact: true })).toHaveValue(secret);
});

test("ignores a late creation response after switching A to B and back to A", async ({ page }) => {
  const state = await mockedTokens(page);
  const gate = deferred();
  state.createGate = gate.wait;
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await openCreate(page, "Late token");
  await drawer(page)
    .locator("form")
    .evaluate((form, path) => {
      (form as HTMLFormElement).requestSubmit();
      window.history.pushState(null, "", path);
    }, `/o/${state.second.slug}${routePath}`);
  await expect(page.getByText("Second organization token", { exact: true })).toBeVisible();
  await switchPath(page, state.organization.slug);
  await expect(
    page.getByText(`Manage integration credentials for ${state.organization.name}.`, { exact: true }),
  ).toBeVisible();
  gate.release();
  await expect(page.getByText("Late token", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Copy your API token" })).toBeHidden();
  expect(state.calls.find((call) => call.procedure === "apiTokens.create")?.slug).toBe(state.organization.slug);
});

test("keeps late list responses out of another organization's page", async ({ page }) => {
  const state = await mockedTokens(page, [metadata(1, "Private first organization token")]);
  const gate = deferred();
  state.listGate = { slug: state.organization.slug, wait: gate.wait };
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await expect.poll(() => state.calls.some((call) => call.procedure === "apiTokens.list")).toBe(true);
  await switchPath(page, state.second.slug);
  await expect(page.getByText("Second organization token", { exact: true })).toBeVisible();
  gate.release();
  await expect(page.getByText("Private first organization token", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Second organization token", { exact: true })).toBeVisible();
});

test("clears a displayed secret on organization switching and does not restore it on return", async ({ page }) => {
  const state = await mockedTokens(page);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await openCreate(page, "Switch secret");
  await drawer(page).getByRole("button", { name: "Create token", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Copy your API token" })).toBeVisible();
  await switchPath(page, state.second.slug);
  await expect(page.getByText("Second organization token", { exact: true })).toBeVisible();
  await expect(page.locator("#created-api-token")).toHaveCount(0);
  await switchPath(page, state.organization.slug);
  await expect(page.getByText("Switch secret", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Copy your API token" })).toBeHidden();
});

test("reports list, creation, and revocation failures without leaking a secret", async ({ page }) => {
  const state = await mockedTokens(page, [metadata(1)]);
  state.failList = true;
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await expect(page.getByRole("alert").filter({ hasText: "Token list unavailable." })).toBeVisible({ timeout: 15000 });
  state.failList = false;
  await page.reload();
  await openCreate(page, "Failed creation");
  state.failCreate = true;
  await drawer(page).getByRole("button", { name: "Create token", exact: true }).click();
  await expect(drawer(page).getByRole("alert")).toContainText("Check the token list before trying again.");
  await expect(page.getByRole("dialog", { name: "Copy your API token" })).toBeHidden();
  await drawer(page).getByRole("button", { name: "Cancel", exact: true }).click();
  state.failRevoke = true;
  await page.getByRole("button", { name: "Revoke Integration 1", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Revoke token", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toHaveText("Couldn’t revoke the token. Try again.");
  state.failRevoke = false;
  await confirmation.getByRole("button", { name: "Revoke token", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Integration 1" })).toContainText("Revoked");
});

test("traps drawer keyboard focus and restores it after Escape", async ({ page }) => {
  const state = await mockedTokens(page);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  const trigger = page.getByRole("button", { name: "Create token", exact: true });
  await trigger.click();
  const close = drawer(page).getByRole("button", { name: "Close drawer", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer(page).getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("defers drawer Tab handling to nested and portalled modals", async ({ page }) => {
  const state = await mockedTokens(page);
  await page.goto(`/o/${state.organization.slug}${routePath}`);
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await expect(drawer(page).getByRole("button", { name: "Close drawer", exact: true })).toBeFocused();

  for (const portalled of [false, true]) {
    const intercepted = await drawer(page).evaluate((content, portalled) => {
      const modal = document.createElement("div");
      modal.setAttribute("role", "alertdialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = "<button>Keep Editing</button><button>Discard</button>";
      (portalled ? document.body : content).prepend(modal);
      const buttons = modal.querySelectorAll("button");
      const results = [true, false].map((shiftKey) => {
        const button = buttons[shiftKey ? 0 : 1]!;
        button.focus();
        const event = new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey,
          bubbles: true,
          cancelable: true,
        });
        button.dispatchEvent(event);
        return event.defaultPrevented;
      });
      modal.remove();
      return results;
    }, portalled);
    expect(intercepted).toEqual([false, false]);
  }
});
