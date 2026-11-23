import { expect, mutate, test } from "./fixtures/property";

test.use({ actionTimeout: 15_000 });

test("property operational status persists and controls the directory filter", async ({ page, property }) => {
  test.setTimeout(120_000);
  await page.goto("/properties");
  for (const status of ["leasing", "maintenance", "active"]) {
    await page.getByRole("button", { name: `Open actions for ${property.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const drawer = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
    const selector = drawer.getByRole("combobox", { name: "Operational Status", exact: true });
    await expect(selector.locator("option")).toHaveText(["Active", "Maintenance", "Leasing"]);
    await selector.selectOption(status);
    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(drawer).toBeHidden();
    await page.reload();
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: `Open actions for ${property.name}`, exact: true }) });
    await expect(row.getByText(status.charAt(0).toUpperCase() + status.slice(1), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption(status);
    await page.getByRole("button", { name: "Apply Filters", exact: true }).click();
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption(status === "active" ? "leasing" : "active");
    await page.getByRole("button", { name: "Apply Filters", exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("button", { name: "Clear Filters", exact: true }).click();
  }
});

test("archived properties cannot change status through the edit drawer", async ({ page, property }) => {
  await mutate(page.request, "properties.archive", { id: property.id });
  await page.goto(`/properties/${property.id}`);
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  const drawer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
  await expect(drawer.getByRole("combobox", { name: "Operational Status", exact: true })).toBeDisabled();
  await expect(drawer.getByRole("combobox", { name: "Operational Status", exact: true })).toHaveValue("archived");
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  await expect(drawer.getByRole("combobox", { name: "Operational Status", exact: true })).toHaveValue("archived");
});

test("creation defaults to Active and failed status saves keep the drawer open", async ({ page, property }) => {
  await page.goto("/properties");
  await page.getByRole("button", { name: "Property", exact: true }).click();
  const createDrawer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Add Property", exact: true }) });
  await expect(createDrawer.getByRole("combobox", { name: "Operational Status", exact: true })).toHaveValue("active");
  await expect(
    createDrawer.getByRole("combobox", { name: "Operational Status", exact: true }).locator("option"),
  ).toHaveCount(3);
  await page.goto(`/properties/${property.id}`);
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  const drawer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
  await drawer.getByRole("combobox", { name: "Operational Status", exact: true }).selectOption("maintenance");
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  let releaseSave = () => {};
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/trpc/properties.update*", async (route) => {
    await pendingSave;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify([
        {
          error: {
            message: "Status update unavailable",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      ]),
    });
  });
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.locator('button[type="submit"]')).toBeDisabled();
  releaseSave();
  await expect(drawer.getByText("Status update unavailable", { exact: true })).toBeVisible();
  await expect(drawer).toBeVisible();
  await page.unroute("**/trpc/properties.update*");
});

test("unrelated edits preserve a status changed while the drawer is open", async ({ page, property }) => {
  await page.goto(`/properties/${property.id}`);
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  const drawer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
  await expect(drawer.getByRole("combobox", { name: "Operational Status", exact: true })).toHaveValue("active");
  await mutate(page.request, "properties.archive", { id: property.id });
  await drawer.getByRole("textbox", { name: "Name", exact: true }).fill(`${property.name} updated`);
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  const saveRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("properties.update"),
  );
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saveRequest).postDataJSON()["0"]).not.toHaveProperty("status");
  await expect(drawer).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  await expect(drawer.getByRole("combobox", { name: "Operational Status", exact: true })).toHaveValue("archived");
});
