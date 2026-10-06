import { randomUUID } from "node:crypto";
import { PrismaClient, PrismaPg } from "../../packages/db/src/index";
import { planLeaseRentCharges } from "../../packages/schemas/src/lease-rent-schedule";
import type { Page, Response } from "@playwright/test";
import { expect, test } from "./fixtures/authenticated";

test("opens the lease wizard for an authenticated user", async ({ page }) => {
  await page.goto("/leases/new");

  await expect(page.getByRole("heading", { name: "Create a lease" })).toBeVisible();
  await expect(page.getByText("Choose the property and unit")).toBeVisible();
});

test("uses a view options menu for property filters on mobile", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/leases/new");

  await expect(page.getByRole("link", { name: "Back to leases" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Property" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View options" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Property availability" })).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "View options" }).click();
  await expect(page.getByRole("menuitem", { name: "All properties" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "List view" })).toBeVisible();
});

test("keeps every lease step visible on an iPad in portrait", async ({ page }) => {
  await page.setViewportSize({ height: 1024, width: 768 });
  await page.goto("/leases/new");

  const reviewStep = page.getByRole("tab", { name: "Review" });
  await expect(reviewStep).toBeVisible();
  await expect
    .poll(() => reviewStep.evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth))
    .toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("keeps the lease dashboard within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/leases");

  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
  const createLease = page.getByRole("link", { name: "Create lease" });
  await expect(createLease).toBeVisible();
  await expect(createLease).toHaveText("Lease");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("creates a resumable draft after selecting a unit", async ({ page }) => {
  await page.goto("/leases/new");

  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const unit = page.locator('input[name="lease-unit"]:not(:disabled)').first();
  await expect(unit).toBeVisible();
  await selectAvailableUnit(page);

  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
  await page.reload();
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await expect(page.locator('input[name="lease-unit"]:checked')).toHaveCount(1);
});

test("shows a pending draft warning on the selected unit", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const createResponse = await selectAvailableUnit(page);
  const createPayload = (await createResponse.json()) as Array<{
    result: { data: { leaseDraftKey: string; propertyId: number; unitId: number } };
  }>;
  const draft = createPayload[0]?.result.data;
  if (!draft) throw new Error("Lease draft creation did not return a draft.");

  await page.goto(`/properties/${draft.propertyId}/units/${draft.unitId}`);

  await expect(page.getByText("Pending lease draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue draft" })).toHaveAttribute(
    "href",
    `/leases/new?draft=${draft.leaseDraftKey}`,
  );
});

test("starts fresh and offers the existing draft only after selecting its unit", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  const draftUrl = page.url();
  const unitId = await page.locator('input[name="lease-unit"]:checked').inputValue();
  await page.getByRole("main").getByRole("link", { name: "Cancel", exact: true }).click();
  await page.goto("/properties");
  await page.goto("/leases/new");
  await expect(page.getByText("Choose the property and unit")).toBeVisible();
  await expect(page.locator('input[name="lease-unit"]:checked')).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator(`input[name="lease-unit"][value="${unitId}"]`).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Choose another unit" }).click();
  await expect(page.locator('input[name="lease-unit"]:checked')).toHaveCount(0);
  await page.locator(`input[name="lease-unit"][value="${unitId}"]`).click();
  await page.getByRole("button", { name: "Resume draft", exact: true }).click();
  await expect(page).toHaveURL(draftUrl);
  await page.goto("/leases");
  const resume = page.locator(`a[href$="${new URL(draftUrl).search}"]`);
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page).toHaveURL(draftUrl);
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await expect(page.locator(`input[name="lease-unit"][value="${unitId}"]`)).toBeChecked();
});

test("replaces a unit draft only after choosing discard and start new", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  const originalUrl = page.url();
  const unitId = await page.locator('input[name="lease-unit"]:checked').inputValue();
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator(`input[name="lease-unit"][value="${unitId}"]`).click();
  await page.getByRole("button", { name: "Discard and start new" }).click();
  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
  expect(page.url()).not.toBe(originalUrl);
  const replacementUrl = page.url();
  await page.goto("/leases");
  const row = page.getByRole("row").filter({ has: page.locator(`a[href$="${new URL(replacementUrl).search}"]`) });
  await row.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.goto(originalUrl);
  await expect(page.getByText("This lease draft is no longer available. Start a new lease draft.")).toBeVisible();
});

test("uses a draft actions menu for an unfinished unit draft on mobile", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  const unitId = await page.locator('input[name="lease-unit"]:checked').inputValue();

  await page.goto("/leases/new");
  await page.setViewportSize({ height: 844, width: 390 });
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator(`input[name="lease-unit"][value="${unitId}"]`).click();
  await expect(page.getByRole("button", { name: "Draft actions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume draft" })).not.toBeVisible();
  await page.getByRole("button", { name: "Draft actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Resume draft" })).toBeVisible();
});

test("reloads the latest draft after a save conflict", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const createResponse = await selectAvailableUnit(page);
  const createPayload = (await createResponse.json()) as Array<{
    result: { data: { id: number; revision: number } };
  }>;
  const createdDraft = createPayload[0]?.result.data;
  if (!createdDraft) throw new Error("Lease draft creation did not return a draft.");
  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);

  await expect(page.getByText("Lease draft saved", { exact: true })).toBeVisible();
  const apiOrigin = new URL(createResponse.url()).origin;
  const secondSessionUpdate = await page.evaluate(
    async ({ apiOrigin, leaseId, leaseDraftKey }) => {
      const draftResponse = await fetch(
        `${apiOrigin}/trpc/leases.draftByKey?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { leaseDraftKey } }))}`,
        { credentials: "include" },
      );
      if (!draftResponse.ok) {
        throw new Error(`Unable to load the lease draft from the second session (${draftResponse.status}).`);
      }
      const draftPayload = (await draftResponse.json()) as Array<{
        result?: { data?: { revision?: number } };
      }> | null;
      const revision = draftPayload?.[0]?.result?.data?.revision;
      if (typeof revision !== "number") {
        throw new Error("Lease draft lookup did not return a revision.");
      }
      const response = await fetch(`${apiOrigin}/trpc/leases.updateDraft?batch=1`, {
        body: JSON.stringify({
          0: { leaseId, expectedRevision: revision, data: { draftStep: "residents" } },
        }),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      return { body: await response.text(), status: response.status };
    },
    { apiOrigin, leaseId: createdDraft.id, leaseDraftKey: new URL(page.url()).searchParams.get("draft")! },
  );
  if (secondSessionUpdate.status !== 200) {
    throw new Error("Unable to update the lease draft from the second session.");
  }

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload latest draft" })).toBeVisible();
  await page.getByRole("button", { name: "Reload latest draft" }).click();
  await expect(page.getByRole("tab", { name: /Residents/ })).toHaveAttribute("aria-selected", "true");
});

test("autosaves a resident selection", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
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

test("continues a reloaded joint billing draft with multiple selected residents", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByRole("radio", { name: "All Tenants", exact: true }).click();

  const firstResidentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").first().click();
  await firstResidentSave;
  const secondResidentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").nth(1).click();
  await secondResidentSave;

  const deposit = page.getByLabel("Security deposit");
  await deposit.fill("500");
  const billingSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await deposit.blur();
  await billingSave;

  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Lease terms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).not.toBeVisible();
});

test("keeps individual allocations aligned with selected residents", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByRole("radio", { name: "All Tenants", exact: true }).click();

  const firstResidentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").first().click();
  await firstResidentSave;

  const billingSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.locator('[role="radio"][value="individual"]').click();
  await billingSave;

  const secondResidentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").nth(1).click();
  await secondResidentSave;

  await expect(page.getByRole("button", { name: "Retry save" })).not.toBeVisible();
  await page.reload();
  await expect(page.locator('[role="radio"][value="individual"]')).toHaveAttribute("data-state", "checked");
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
});

test("autosaves lease terms and resumes on the terms step", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
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

test("autosaves fixed-term dates", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
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

  const dates = await page.evaluate(() =>
    [14, 21].map((daysAhead) => {
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      return {
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(date),
      };
    }),
  );
  const [startDate, endDate] = dates;
  if (!startDate || !endDate) throw new Error("Unable to choose lease dates.");

  async function selectDate(value: string) {
    const day = page.locator(`[data-day="${value}"]`);
    for (let month = 0; month < 2 && !(await day.isVisible()); month++) {
      await page.getByRole("button", { name: "Go to the Next Month" }).click();
    }
    await day.click();
  }

  await page.locator("#lease-start-date").click();
  await selectDate(startDate.value);
  await page.locator("#lease-end-date").click();
  const draftSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await selectDate(endDate.value);
  await draftSave;

  await page.reload();
  await expect(page.locator("#lease-start-date")).toHaveText(startDate.label);
  await expect(page.locator("#lease-end-date")).toHaveText(endDate.label);
});

test("waits for an in-flight autosave before saving the next step", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible();

  const depositSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByLabel("Security deposit").fill("500");
  await page.getByLabel("Security deposit").blur();
  await depositSave;

  let releaseAutosave!: () => void;
  const autosaveReleased = new Promise<void>((resolve) => {
    releaseAutosave = resolve;
  });
  let autosaveStarted!: () => void;
  const autosaveInFlight = new Promise<void>((resolve) => {
    autosaveStarted = resolve;
  });
  const revisions: number[] = [];
  let savedRevision: number | undefined;
  await page.route("**/trpc/leases.updateDraft*", async (route) => {
    const input = route.request().postDataJSON() as Record<string, { expectedRevision: number }>;
    revisions.push(input["0"].expectedRevision);
    const response = await route.fetch();
    if (revisions.length === 1) {
      const payload = await response.json();
      savedRevision = payload[0].result.data.revision;
      autosaveStarted();
      await autosaveReleased;
    }
    await route.fulfill({ response });
  });

  await page.getByRole("checkbox").first().click();
  await autosaveInFlight;
  try {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    // Hold the response beyond the debounce window to expose overlapping saves.
    await page.waitForTimeout(800);
    expect(revisions).toHaveLength(1);
  } finally {
    releaseAutosave();
  }
  await expect(page.getByRole("heading", { name: "Lease terms" })).toBeVisible();
  await expect.poll(() => revisions[1]).toBe(savedRevision);
  await expect(page.getByRole("button", { name: "Reload latest draft" })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lease terms" })).toBeVisible();
});

for (const exitLabel of ["Cancel", "Leases"]) {
  test(`blocks ${exitLabel} during the draft save debounce`, async ({ page }) => {
    await page.goto("/leases/new");
    await page
      .getByRole("button", { name: /Expand .* units/ })
      .first()
      .click();
    await selectAvailableUnit(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("checkbox").first()).toBeVisible();

    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Choose the property and unit")).toBeVisible();
    const draftUrl = page.url();
    const exit = page.getByRole("main").getByRole("link", { name: exitLabel, exact: true });
    await exit.click();
    await expect(page).toHaveURL(draftUrl);
    await expect(page.getByText("Save or retry the current changes before leaving the wizard.")).toBeVisible();

    const saved = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
    );
    await page.clock.resume();
    await saved;
    await expect(page.getByText("Lease draft saved", { exact: true })).toBeVisible();
    await exit.click();
    await expect(page).toHaveURL(/\/leases$/);
  });
}

test("waits for explicitly resumed draft hydration before autosaving", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await selectAvailableUnit(page);
  const nextStepSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await nextStepSave;
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  const residentSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").first().click();
  await residentSave;
  await expect(page.getByText("Lease draft saved", { exact: true })).toBeVisible();

  const draftUrl = page.url();
  let releaseLoad!: () => void;
  const loadReleased = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  let loadStarted!: () => void;
  const loadInFlight = new Promise<void>((resolve) => {
    loadStarted = resolve;
  });
  const saves: unknown[] = [];
  await page.route("**/trpc/**", async (route) => {
    if (route.request().url().includes("leases.updateDraft")) {
      saves.push(route.request().postDataJSON());
    }
    if (route.request().url().includes("leases.draftByKey")) {
      loadStarted();
      await loadReleased;
    }
    await route.continue();
  });

  await page.goto(draftUrl);
  await loadInFlight;
  try {
    // Keep hydration pending beyond the autosave debounce.
    await page.waitForTimeout(1200);
    expect(saves).toHaveLength(0);
  } finally {
    releaseLoad();
  }
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  const resumedSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.getByRole("checkbox").first().uncheck();
  await resumedSave;
  await page.reload();
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
});

test("resumes a draft and creates the same lease from Review", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required to clean up the lease test records.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  let createdTenantId: number | undefined;
  let createdLeaseId: number | undefined;
  let createdDraftKey: string | null = null;
  try {
    await page.goto("/leases/new");
    await expect(page).toHaveURL(/\/o\/[^/]+\/leases\/new/);
    const organizationSlug = new URL(page.url()).pathname.match(/^\/o\/([^/]+)/)?.[1];
    if (!organizationSlug) throw new Error("Organization URL was not found.");
    const tenantSuffix = randomUUID().slice(0, 8);
    const tenantResponse = await page.request.post("/trpc/tenants.create?batch=1", {
      headers: { "x-parcelis-organization-slug": organizationSlug },
      data: {
        "0": {
          firstName: "LeaseE2E",
          lastName: tenantSuffix,
          email: `${randomUUID()}@example.test`,
          accountStatus: "invitation_pending",
          insuranceStatus: "not_on_file",
        },
      },
    });
    if (!tenantResponse.ok()) throw new Error(`Tenant setup failed: ${tenantResponse.status()}`);
    const tenantPayload = (await tenantResponse.json()) as Array<{ result?: { data?: { id?: number } } }>;
    createdTenantId = tenantPayload.find((entry) => entry.result?.data?.id)?.result?.data?.id;
    if (!createdTenantId) throw new Error("Tenant setup did not return an ID.");
    await page.reload();
    await page
      .getByRole("button", { name: /Expand .* units/ })
      .first()
      .click();
    const createResponses: Response[] = [];
    page.on("response", (response) => {
      if (response.request().method() === "POST" && response.url().includes("leases.createDraft")) {
        createResponses.push(response);
      }
    });
    await selectAvailableUnit(
      page,
      async (unitId) =>
        (await prisma.lease.count({
          where: { unitId, status: { in: ["active", "notice", "scheduled"] } },
        })) === 0,
    );
    const draftKey = new URL(page.url()).searchParams.get("draft");
    const payloads = await Promise.all(
      createResponses.map(
        (response) =>
          response.json() as Promise<Array<{ result?: { data?: { id?: number; leaseDraftKey?: string } } }>>,
      ),
    );
    const leaseId = payloads.flat().find((entry) => entry.result?.data?.leaseDraftKey === draftKey)?.result?.data?.id;
    if (!leaseId) throw new Error("Lease draft creation did not return an ID.");
    createdLeaseId = leaseId;
    createdDraftKey = draftKey;

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("checkbox", { name: `Select LeaseE2E ${tenantSuffix}` }).click();
    await page.getByLabel("Monthly rent").fill("1000");
    await page.getByLabel("Monthly rent").blur();
    await page.getByLabel("Security deposit").fill("500");
    await page.getByRole("radio", { name: /All tenants are equally responsible/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByText("Month-to-month", { exact: true }).click();
    const startDate = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    });
    await page.locator("#lease-start-date").click();
    await page.locator(`[data-day="${startDate}"]`).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review lease" })).toBeVisible();

    const draftSearch = new URL(page.url()).search;
    await page.goto("/leases");
    await page.locator(`a[href$="${draftSearch}"]`).click();
    await expect(page.getByRole("heading", { name: "Review lease" })).toBeVisible();
    const plannedCharges = planLeaseRentCharges({
      monthlyRentCents: 100_000,
      rentDueDay: 1,
      startsOn: startDate,
      endsOn: null,
      billingResponsibility: "joint",
      tenantIds: [createdTenantId],
      tenantAllocations: [],
    });
    await expect(page.getByText("12 invoices planned", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Finalize lease" }).click();
    await expect(page).toHaveURL(new RegExp(`/leases/${leaseId}$`));
    await expect(page.getByText("1st of each month").first()).toBeVisible();
    const invoices = await prisma.invoice.findMany({ where: { leaseId }, orderBy: { periodStartsOn: "asc" } });
    expect(
      invoices.map(({ sourceKey, amountCents, dueOn, periodStartsOn, periodEndsOn }) => ({
        sourceKey,
        amountCents,
        dueOn: dueOn.toISOString().slice(0, 10),
        periodStartsOn: periodStartsOn.toISOString().slice(0, 10),
        periodEndsOn: periodEndsOn.toISOString().slice(0, 10),
      })),
    ).toEqual(
      plannedCharges.map(({ sourceKey, amountCents, dueOn, periodStartsOn, periodEndsOn }) => ({
        sourceKey,
        amountCents,
        dueOn,
        periodStartsOn,
        periodEndsOn,
      })),
    );
  } finally {
    try {
      await prisma.$transaction(async (tx) => {
        if (createdLeaseId && createdDraftKey && createdTenantId) {
          const lease = await tx.lease.findFirst({
            where: {
              id: createdLeaseId,
              leaseDraftKey: createdDraftKey,
              OR: [{ status: "draft" }, { tenants: { some: { tenantId: createdTenantId } } }],
            },
          });
          if (lease) {
            if ((lease.status === "active" || lease.status === "notice") && lease.propertyId) {
              await tx.property.update({
                where: { id: lease.propertyId },
                data: { occupiedUnits: { decrement: 1 } },
              });
            }
            await tx.outboxEvent.deleteMany({ where: { idempotencyKey: `lease:${lease.id}:activate` } });
            await tx.lease.delete({ where: { id: lease.id } });
          }
        }
        if (createdTenantId) await tx.tenant.delete({ where: { id: createdTenantId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }
});

async function selectAvailableUnit(page: Page, isUsable?: (unitId: number) => Promise<boolean>) {
  const units = page.locator('input[name="lease-unit"]:not(:disabled)');
  for (let index = 0; index < (await units.count()); index++) {
    if (isUsable && !(await isUsable(Number(await units.nth(index).getAttribute("value"))))) continue;
    const created = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("leases.createDraft"),
    );
    await units.nth(index).click();
    const response = await created;
    await expect
      .poll(async () => page.url().includes("?draft=") || (await page.getByRole("alertdialog").isVisible()))
      .toBe(true);
    if (await page.getByRole("alertdialog").isVisible()) {
      await page.getByRole("button", { name: "Choose another unit" }).click();
      continue;
    }
    await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
    return response;
  }
  throw new Error("No available unit without an existing draft was found.");
}
