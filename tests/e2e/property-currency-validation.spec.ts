import { expect, test } from "./fixtures/property";

test("invalid market rates explain precision and storage limits before submission", async ({ page, property }) => {
  await page.goto(`/properties/${property.id}`);
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  const drawer = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Edit Property", exact: true }) });
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  const marketRate = drawer.getByRole("spinbutton", { name: "Market Rate (USD)", exact: true });
  const save = drawer.getByRole("button", { name: "Save", exact: true });
  const error = drawer.getByRole("alert").filter({ hasText: "Enter a valid USD amount" });

  await marketRate.fill("12.345");
  await expect(save).toBeDisabled();
  await expect(error).toContainText("at most 2 decimal places");
  await expect(marketRate).toHaveAttribute("aria-invalid", "true");
  await expect(marketRate).toHaveAccessibleDescription(/Enter a valid USD amount/);

  const maximum = await marketRate.getAttribute("max");
  expect(maximum).not.toBeNull();
  await marketRate.fill(String(BigInt(maximum!.split(".")[0]!) + 1n));
  await expect(save).toBeDisabled();
  await expect(error).toContainText(`up to ${maximum}`);

  await marketRate.fill("12.34");
  await expect(error).toHaveCount(0);
  await expect(marketRate).not.toHaveAttribute("aria-invalid", "true");
  await expect(marketRate).not.toHaveAttribute("aria-describedby");
  await expect(save).toBeEnabled();
});
