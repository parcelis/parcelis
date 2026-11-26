import { PrismaClient, PrismaPg } from "../../packages/db/src/index";
import { expect, mutate, test } from "./fixtures/property";

test.use({ actionTimeout: 15_000 });

test("archive and restore a unit while keeping its direct link and property editor safe", async ({
  page,
  property,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/properties/${property.id}`);
  const inventory = page.getByRole("combobox", { name: "Unit inventory" });
  const unitLink = page.getByRole("link", { name: /Unit Test Unit/ });
  await expect(unitLink).toBeVisible();
  const unitPath = (await unitLink.getAttribute("href"))!;
  await unitLink.click();
  const heading = page.getByRole("heading", { name: "Unit Test Unit", exact: true });
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive Unit" }).click();
  const archive = page.getByRole("alertdialog", { name: "Archive unit?" });
  await archive.getByRole("button", { name: "Keep Active" }).click();
  await expect(archive).toBeHidden();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive Unit" }).click();
  await archive.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${unitPath}$`));

  await page.goto(`/properties/${property.id}`);
  await expect(page.getByText("No active units.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Property", exact: true }).click();
  const editor = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Edit Property", exact: true }),
  });
  await editor.getByRole("button", { name: "Next", exact: true }).click();
  await expect(editor.getByText("Test Unit", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toBeHidden();

  let release = () => {};
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/trpc/units.list?*",
    async (route) => {
      await response;
      await route.continue();
    },
    { times: 1 },
  );
  await inventory.selectOption("archived");
  await expect(page.getByText("Loading archived units…")).toBeVisible();
  release();
  await expect(unitLink).toHaveAttribute("href", unitPath);
  await unitLink.click();
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await mutate(page.request, "properties.archive", { id: property.id });
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restore Unit" }).click();
  const restore = page.getByRole("alertdialog", { name: "Restore unit?" });
  await restore.getByRole("button", { name: "Restore" }).click();
  await expect(restore.getByRole("alert")).toHaveText("Restore the property before restoring this unit.");
  await mutate(page.request, "properties.reactivate", { id: property.id });
  await restore.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Vacant", { exact: true })).toBeVisible();
  await page.goto(`/properties/${property.id}`);
  await expect(unitLink).toBeVisible();
  await page.route("**/trpc/units.list?*", (route) => route.abort());
  await inventory.selectOption("archived");
  await expect(page.getByText("Unable to load archived units.", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.unroute("**/trpc/units.list?*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("No archived units.", { exact: true })).toBeVisible();
});

test("shows the archive restriction for scheduled and active leases", async ({ page, property }) => {
  const databaseUrl = process.env.DATABASE_URL;
  test.skip(
    !databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname),
    "A local test database is required.",
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
  try {
    const saved = await prisma.property.findUniqueOrThrow({
      where: { id: property.id, name: property.name },
      select: { organizationId: true, units: { select: { id: true } } },
    });
    const unitId = saved.units[0]!.id;
    const lease = await prisma.lease.create({
      data: { organizationId: saved.organizationId, propertyId: property.id, unitId, status: "scheduled" },
    });
    try {
      await page.goto(`/properties/${property.id}/units/${unitId}`);
      await expect(page.getByRole("heading", { name: "Unit Test Unit", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Archive Unit" }).click();
      const archive = page.getByRole("alertdialog", { name: "Archive unit?" });
      for (const status of ["scheduled", "active"] as const) {
        await prisma.lease.update({ where: { id: lease.id }, data: { status } });
        const result = page.waitForResponse((response) => response.url().includes("/trpc/units.archive"));
        await archive.getByRole("button", { name: "Archive", exact: true }).click();
        expect((await result).status()).toBe(409);
        await expect(archive.getByRole("alert")).toContainText("Resolve scheduled, active, or notice leases");
      }
      await archive.getByRole("button", { name: "Keep Active" }).click();
      await expect(page.getByText("Archived", { exact: true })).toHaveCount(0);
    } finally {
      await prisma.lease.delete({ where: { id: lease.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
});
