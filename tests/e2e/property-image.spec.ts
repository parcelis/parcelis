import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deletePropertyImageObject } from "../../apps/api/src/modules/object-storage.config";
import { expect, test } from "./fixtures/property";

test.use({ actionTimeout: 15_000 });

test("uploads, displays, and deletes a property image", async ({ page, property }) => {
  test.setTimeout(120_000);
  let objectKey: string | undefined;
  try {
    await page.goto(`/properties/${property.id}`);
    await page.getByRole("button", { name: "Edit Property", exact: true }).click();
    const drawer = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
    const buffer = await readFile(resolve(__dirname, "../../apps/web/public/brand/parcelis-fullmark-light.png"));
    await drawer
      .locator('input[type="file"]')
      .setInputFiles({ name: "test-property.png", mimeType: "image/png", buffer });
    await drawer.getByRole("button", { name: "Next", exact: true }).click();
    const uploaded = page.waitForResponse((response) => response.url().includes("properties.createImageUploadUrl"));
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    const payload = (await (await uploaded).json()) as Array<{ result?: { data: { objectKey: string } } }>;
    objectKey = payload[0]?.result?.data.objectKey;
    expect(objectKey).toBeDefined();
    await expect(drawer).toBeHidden();
    await page.reload();
    const image = page.getByRole("img", { name: `${property.name} property`, exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
      .toBe(true);
    const imageUrl = await image.getAttribute("src");
    expect(imageUrl).toBeTruthy();
    const stored = await page.request.get(imageUrl!);
    expect(stored.ok()).toBe(true);
    expect(await stored.body()).toEqual(buffer);

    await page.getByRole("button", { name: "Edit Property", exact: true }).click();
    const deleted = page.waitForResponse((response) => response.url().includes("properties.deleteImage"));
    await drawer.getByRole("button", { name: "Delete image", exact: true }).click();
    expect((await deleted).ok()).toBe(true);
    await page.reload();
    await expect(image).toHaveCount(0);
    expect((await page.request.get(imageUrl!)).status()).toBe(404);
  } finally {
    if (objectKey) {
      try {
        await deletePropertyImageObject(objectKey);
      } catch {
        console.warn("Property image cleanup failed.");
      }
    }
  }
});
