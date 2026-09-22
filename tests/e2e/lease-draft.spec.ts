import { expect, test } from "./fixtures/authenticated";

test("opens the lease wizard for an authenticated user", async ({ page }) => {
  await page.goto("/leases/new");

  await expect(page.getByRole("heading", { name: "Create a lease" })).toBeVisible();
  await expect(page.getByText("Choose the property and unit")).toBeVisible();
});

test("creates a resumable draft after selecting a unit", async ({ page }) => {
  await page.goto("/leases/new");

  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const unit = page.locator('input[name="lease-unit"]:not(:disabled)').first();
  await expect(unit).toBeVisible();
  await unit.check();

  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);
  await page.reload();
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await expect(unit).toBeChecked();
});

test("reloads the latest draft after a save conflict", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  const draftCreated = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.createDraft"),
  );
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  const createResponse = await draftCreated;
  const createPayload = (await createResponse.json()) as Array<{
    result: { data: { id: number; revision: number } };
  }>;
  const createdDraft = createPayload[0]?.result.data;
  if (!createdDraft) throw new Error("Lease draft creation did not return a draft.");

  const apiOrigin = new URL(createResponse.url()).origin;
  const secondSessionUpdate = await page.evaluate(
    async ({ apiOrigin, leaseId, revision }) => {
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
    { apiOrigin, leaseId: createdDraft.id, revision: createdDraft.revision },
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
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
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
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();

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
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();

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
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
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
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
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

  await page.locator("#lease-start-date").click();
  await page.locator('[data-day="2026-09-22"]').click();
  await page.locator("#lease-end-date").click();
  const draftSave = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("leases.updateDraft"),
  );
  await page.locator('[data-day="2026-09-29"]').click();
  await draftSave;

  await page.reload();
  await expect(page.locator("#lease-start-date")).toHaveText(/September 22, 2026/);
  await expect(page.locator("#lease-end-date")).toHaveText(/September 29, 2026/);
});

test("waits for an in-flight autosave before saving the next step", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible();

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
  expect(revisions[1]).toBe(savedRevision);
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
    await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
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

test("waits for session-restored draft hydration before autosaving", async ({ page }) => {
  await page.goto("/leases/new");
  await page
    .getByRole("button", { name: /Expand .* units/ })
    .first()
    .click();
  await page.locator('input[name="lease-unit"]:not(:disabled)').first().check();
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

  // Omit the URL key so the lease identity is restored from session storage.
  await page.goto("/leases/new");
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
