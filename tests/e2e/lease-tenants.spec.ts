import { randomUUID } from "node:crypto";
import { PrismaClient, PrismaPg } from "../../packages/db/src/index";
import { expect, test } from "./fixtures/authenticated";

test("shows shared tenants on lease cards, the selected lease record, and tenant history", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.DATABASE_URL, "DATABASE_URL is required for isolated lease fixtures.");
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl.toString() },
      { schema: databaseUrl.searchParams.get("schema") ?? "public" },
    ),
  });
  const suffix = randomUUID().slice(0, 8);
  let propertyId: number | undefined;
  const tenantIds: number[] = [];
  const leaseIds: number[] = [];

  try {
    await page.goto("/leases");
    await expect(page).toHaveURL(/\/o\/[^/]+\/leases$/);
    const slug = new URL(page.url()).pathname.split("/")[2]!;
    const { id: organizationId } = await prisma.organization.findUniqueOrThrow({ where: { slug } });
    const property = await prisma.property.create({
      data: {
        organizationId,
        name: `Shared lease ${suffix}`,
        line1: "44 Test Street",
        city: "Test City",
        region: "CA",
        postalCode: "90001",
        unitCount: 2,
        units: {
          create: [
            { name: "Shared", marketRateCents: 100000 },
            { name: "Solo", marketRateCents: 100000 },
          ],
        },
      },
      include: { units: true },
    });
    propertyId = property.id;
    const tenants = [];
    for (const firstName of ["Alice", "Bob", "Catherine Alexandra"]) {
      const tenant = await prisma.tenant.create({
        data: {
          organizationId,
          firstName,
          lastName: `CoTenant-${suffix}`,
          email: `${randomUUID()}@example.com`,
        },
      });
      tenantIds.push(tenant.id);
      tenants.push(tenant);
    }
    const lease = await prisma.lease.create({
      data: {
        organizationId,
        propertyId,
        unitId: property.units.find((unit) => unit.name === "Shared")!.id,
        status: "ended",
        termType: "fixed",
        startsOn: new Date("2020-01-01"),
        endsOn: new Date("2020-12-31"),
        monthlyRentCents: 100000,
        tenants: { create: tenantIds.map((tenantId) => ({ tenantId })) },
      },
    });
    leaseIds.push(lease.id);
    const soloLease = await prisma.lease.create({
      data: {
        organizationId,
        propertyId,
        unitId: property.units.find((unit) => unit.name === "Solo")!.id,
        status: "draft",
        tenants: { create: { tenantId: tenantIds[0]! } },
      },
    });
    leaseIds.push(soloLease.id);
    const name = (tenant: (typeof tenants)[number]) => `${tenant.firstName} ${tenant.lastName}`;
    const leasePath = `/o/${slug}/leases/${lease.id}`;

    await page.goto(leasePath);
    for (const tenant of tenants) {
      const card = page.getByRole("article", { name: name(tenant), exact: true });
      const coTenants = card.getByRole("list", { name: "Co-tenants", exact: true });
      await expect(coTenants.getByRole("link")).toHaveCount(2);
      await expect(coTenants.getByRole("link", { name: name(tenant), exact: true })).toHaveCount(0);
      for (const other of tenants.filter((other) => other.id !== tenant.id)) {
        await expect(coTenants.getByRole("link", { name: name(other), exact: true })).toHaveAttribute(
          "href",
          `/tenants/${other.id}`,
        );
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page
      .getByRole("article", { name: name(tenants[0]!), exact: true })
      .getByRole("link", { name: name(tenants[0]!), exact: true })
      .click();
    const drawer = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Tenant Lease Record", exact: true }),
    });
    const drawerTenants = drawer.getByRole("list", { name: "Tenants", exact: true });
    await expect(drawerTenants.getByRole("link")).toHaveCount(3);
    await expect(drawerTenants.getByRole("link", { name: name(tenants[2]!), exact: true })).toBeVisible();
    await drawerTenants.getByRole("link", { name: name(tenants[1]!), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/tenants/${tenants[1]!.id}$`));

    for (const tenant of tenants) {
      await page.goto(`/o/${slug}/tenants/${tenant.id}`);
      const history = page.getByRole("list", { name: "Tenants", exact: true });
      await expect(history.getByRole("link")).toHaveCount(3);
      for (const other of tenants) {
        await expect(history.getByRole("link", { name: name(other), exact: true })).toBeVisible();
      }
    }

    // Membership changes must be reflected by both independently loaded surfaces.
    await prisma.leaseTenant.deleteMany({ where: { leaseId: lease.id, tenantId: { in: tenantIds.slice(1) } } });
    await page.goto(leasePath);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Co-tenants", exact: true })).toHaveCount(0);
    await page.goto(`/o/${slug}/tenants/${tenantIds[0]}`);
    await expect(page.getByRole("heading", { name: name(tenants[0]!), exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Tenants", exact: true })).toHaveCount(0);

    await prisma.leaseTenant.create({ data: { organizationId, leaseId: lease.id, tenantId: tenantIds[2]! } });
    await page.goto(leasePath);
    await expect(page.getByRole("article")).toHaveCount(2);
    const coTenants = page
      .getByRole("article", { name: name(tenants[0]!), exact: true })
      .getByRole("list", { name: "Co-tenants", exact: true });
    await expect(coTenants.getByRole("link")).toHaveCount(1);
    await expect(coTenants.getByRole("link", { name: name(tenants[2]!), exact: true })).toBeVisible();
    await page.goto(`/o/${slug}/tenants/${tenantIds[0]}`);
    await expect(page.getByRole("list", { name: "Tenants", exact: true }).getByRole("link")).toHaveCount(2);
  } finally {
    await prisma.lease.deleteMany({ where: { id: { in: leaseIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    if (propertyId !== undefined) {
      await prisma.unit.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });
    }
    await prisma.$disconnect();
  }
});
