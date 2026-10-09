import { expect, test } from "./fixtures/property";

test.use({ actionTimeout: 15_000 });

test("updates a property and manages notes through the Next.js API", async ({ page, property }) => {
  test.setTimeout(120_000);
  const { name } = property;
  const updatedName = `${name} updated`;
  const noteBody = `Property note for ${name}`;
  const editedNoteBody = `${noteBody} — verified after editing`;
  await test.step("Update the property name and verify it after reloading", async () => {
    await page.goto(`/properties/${property.id}`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit Property", exact: true }).click();
    const drawer = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
    await drawer.getByRole("textbox", { name: "Name", exact: true }).fill(updatedName);
    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    const saved = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("properties.update"),
    );
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    await expect(drawer).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: updatedName, exact: true })).toBeVisible();
  });

  await test.step("Create a property note and verify it after reloading", async () => {
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Add Note", exact: true }).click();
    const drawer = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Notes", exact: true }) });
    await drawer.getByRole("textbox", { name: "New note", exact: true }).fill(noteBody);
    await drawer.getByRole("button", { name: "Add note", exact: true }).last().click();
    await expect(drawer.getByText(noteBody, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Add Note", exact: true }).click();
    await expect(drawer.getByText(noteBody, { exact: true })).toBeVisible();
  });

  await test.step("Edit the note and verify it after reloading", async () => {
    const drawer = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Notes", exact: true }) });
    await drawer.getByRole("button", { name: "Note actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await drawer.getByRole("textbox", { name: "Edit note", exact: true }).fill(editedNoteBody);
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(drawer.getByText(editedNoteBody, { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Add Note", exact: true }).click();
    await expect(drawer.getByText(editedNoteBody, { exact: true })).toBeVisible();
  });
});
