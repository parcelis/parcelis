import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@parcelis/db";
import type { PermissionResource } from "@parcelis/schemas";
import { appRouter } from "../../router/app.router";
import { createContext, type Context } from "../../router/context";
import { createTestSessionCookie } from "../auth/session-cookie";

const resources: PermissionResource[] = [
  "properties",
  "units",
  "leases",
  "tenants",
  "invoices",
  "maintenance",
  "property_notes",
  "tenant_notes",
];
const tenant = { id: 4, firstName: "Private", lastName: "Tenant", email: "private@example.com" };
const invoice = { id: 8, balanceCents: 12345, invoiceNumber: "INV-private" };
const lease = {
  id: 7,
  unitId: 3,
  propertyId: 2,
  archivedAt: null,
  status: "active",
  termType: "fixed",
  startsOn: new Date("2026-01-01"),
  endsOn: null,
  monthlyRentCents: 100_000,
  tenants: [{ tenant }],
  unit: { name: "Private unit" },
  property: { id: 2, name: "Private property" },
  invoices: [invoice],
};
const property = {
  id: 2,
  name: "Private property",
  imageObjectKey: null,
  legacyNotes: "Private property note",
  legacyNoteId: 10,
  unitCount: 1,
  occupiedUnits: 1,
  leases: [lease],
  units: [{ id: 3, name: "Private unit", bathrooms: null, amenities: [], utilities: [], _count: { leases: 1 } }],
  maintenanceTickets: [
    { id: 9, title: "Private repair", priority: "urgent", status: "open", unitLabel: "Private unit" },
  ],
};
const tenantRecord = {
  ...tenant,
  imageObjectKey: null,
  archivedAt: null,
  legacyNotes: "Private tenant note",
  legacyNoteId: 11,
  emergencyContacts: [],
  leases: [{ lease }],
};
function createCaller(
  granted: PermissionResource[],
  overrides: Record<string, unknown> = {},
  role = "property_manager",
) {
  const permissions = granted.map((resource) => ({ resource, canView: true }));
  return appRouter.createCaller({
    prisma: {
      rolePermission: {
        findMany: async () => permissions,
        findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) =>
          permissions.find((permission) => permission.resource === where.role_resource.resource) ?? null,
      },
      property: {
        findMany: async ({ include }: { include: { leases: unknown } }) => [
          { ...property, leases: include.leases ? [lease] : [] },
        ],
        findFirst: async ({ include }: { include: { leases: unknown } }) => ({
          ...property,
          leases: include.leases ? [lease] : [],
        }),
      },
      tenant: { findMany: async () => [tenantRecord], findFirst: async () => tenantRecord },
      invoice: { updateMany: async () => ({ count: 0 }) },
      ...overrides,
    },
    req: { headers: {} },
    session: { userId: 1, user: { id: 1, role } },
    organization: { organizationId: 1, organization: { id: 1 } },
  } as unknown as Context);
}
for (const denied of resources.filter((resource) => resource !== "properties")) {
  test(`property list and detail redact denied ${denied} data`, async () => {
    const caller = createCaller(resources.filter((resource) => resource !== denied));
    for (const result of [(await caller.properties.list())[0]!, (await caller.properties.byId({ id: 2 }))!]) {
      assert.equal(result.id, 2);
      if (denied === "leases") {
        assert.deepEqual(result.leases, []);
        assert.deepEqual(result.leaseHistory, []);
        assert.equal(result.occupiedUnits, null);
      }
      if (denied === "units") {
        assert.deepEqual(result.units, []);
        assert.equal(result.leases[0]?.unitId, null);
        assert.equal(result.leases[0]?.unitLabel, "Unavailable");
      }
      if (denied === "tenants") {
        assert.equal(result.leases[0]?.tenant, null);
        assert.deepEqual(result.leases[0]?.tenants, []);
        assert.equal(JSON.stringify(result).includes(tenant.email), false);
      }
      if (denied === "invoices") {
        assert.equal(result.leases[0]?.amountOverdueCents, null);
        assert.equal(result.leaseHistory[0]?.amountOverdueCents, null);
        assert.equal(JSON.stringify(result).includes(invoice.invoiceNumber), false);
      }
      if (denied === "maintenance") assert.deepEqual(result.maintenanceTickets, []);
      if (denied === "property_notes") {
        assert.equal(result.notes, null);
        assert.equal(result.legacyNotes, null);
        assert.equal(result.legacyNoteId, null);
      }
    }
    const list = (await caller.properties.list())[0]!;
    if (denied === "leases") {
      assert.equal(list.monthlyRentCents, null);
      assert.equal(list.expiringLeases90Days, null);
      assert.equal(list.units[0]?.isOccupied, null);
    }
    if (denied === "invoices" || denied === "leases") assert.equal(list.amountOverdueCents, null);
    if (denied === "maintenance") {
      assert.equal(list.openMaintenanceTickets, null);
      assert.equal(list.urgentMaintenanceTickets, null);
    }
  });
}
test("property reads omit tenantless leases only when tenants are visible", async () => {
  for (const canViewTenants of [true, false]) {
    const propertyWithoutTenants = { ...property, leases: [{ ...lease, tenants: [] }] };
    const caller = createCaller(
      resources.filter((resource) => canViewTenants || resource !== "tenants"),
      {
        property: {
          findMany: async () => [propertyWithoutTenants],
          findFirst: async () => propertyWithoutTenants,
        },
      },
    );
    for (const result of [(await caller.properties.list())[0]!, (await caller.properties.byId({ id: 2 }))!]) {
      assert.equal(result.leases.length, canViewTenants ? 0 : 1);
      assert.equal(result.leaseHistory.length, canViewTenants ? 0 : 1);
    }
  }
});

for (const denied of ["leases", "invoices", "properties", "units", "tenant_notes"] as PermissionResource[]) {
  test(`tenant list and detail redact denied ${denied} data`, async () => {
    const caller = createCaller(resources.filter((resource) => resource !== denied));
    for (const result of [(await caller.tenants.list())[0]!, (await caller.tenants.byId({ id: 4 }))!]) {
      assert.equal(result.id, 4);
      if (denied === "leases") {
        assert.deepEqual(result.leases, []);
        assert.equal(result.tenantStatus, null);
      }
      if (denied === "properties") {
        assert.equal(result.leases[0]?.property, null);
        assert.equal(result.leases[0]?.propertyId, null);
      }
      if (denied === "units") {
        assert.equal(result.leases[0]?.unit, null);
        assert.equal(result.leases[0]?.unitId, null);
        assert.equal(result.leases[0]?.unitLabel, "Unavailable");
      }
      if (denied === "tenant_notes") {
        assert.equal(result.legacyNotes, null);
        assert.equal(result.legacyNoteId, null);
      }
    }
    if (denied === "invoices") assert.deepEqual((await caller.tenants.byId({ id: 4 }))?.leases[0]?.invoices, []);
  });
}
for (const role of ["property_manager", "administrator"]) {
  test(`authorized nested reads preserve records and totals for ${role}`, async () => {
    const caller = createCaller(role === "administrator" ? [] : resources, {}, role);
    const result = (await caller.properties.list())[0]!;
    assert.equal(result.monthlyRentCents, 100_000);
    assert.equal(result.amountOverdueCents, invoice.balanceCents);
    assert.equal(result.occupiedUnits, 1);
    assert.equal(result.units[0]?.isOccupied, true);
    assert.equal(result.leases[0]?.tenant?.id, 4);
    assert.equal(result.leases[0]?.invoices[0]?.id, 8);
    assert.equal(result.notes, property.legacyNotes);
    assert.equal(result.maintenanceTickets[0]?.id, 9);
    const detail = await caller.tenants.byId({ id: 4 });
    assert.equal(detail?.leases[0]?.invoices[0]?.id, 8);
    assert.equal(detail?.tenantStatus, "active");
    assert.equal(detail?.legacyNotes, tenantRecord.legacyNotes);
  });
}
test("invoice reads and PDFs require invoice view even with property and tenant access", async () => {
  const caller = createCaller(["properties", "tenants", "leases"]);
  for (const operation of [
    () => caller.invoices.list({}),
    () => caller.invoices.byId({ id: 8 }),
    () => caller.invoices.pdf({ id: 8 }),
  ]) {
    await assert.rejects(operation, { code: "FORBIDDEN" });
  }
});
test("notes require both note and parent view permissions", async () => {
  for (const granted of [["properties"], ["property_notes"]] as PermissionResource[][]) {
    await assert.rejects(() => createCaller(granted).notes.list({ propertyId: 2, limit: 10 }), { code: "FORBIDDEN" });
  }
});
test("direct record reads and PDFs scope foreign IDs to the current organization", async () => {
  const findFirst = async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { id: 999, organizationId: 1 });
    return null;
  };
  const caller = createCaller(resources, {
    property: { findFirst },
    tenant: { findFirst },
    invoice: { updateMany: async () => ({ count: 0 }), findFirst },
    note: {
      findMany: async ({ where }: { where: { OR: unknown[] } }) => {
        assert.deepEqual(where.OR, [
          { property: { organizationId: 1 } },
          { tenant: { organizationId: 1 } },
          { unit: { property: { organizationId: 1 } } },
          { maintenanceTicket: { organizationId: 1 } },
          { application: { organizationId: 1 } },
          { invoice: { organizationId: 1 } },
        ]);
        return [];
      },
    },
  });
  assert.equal(await caller.properties.byId({ id: 999 }), null);
  assert.equal(await caller.tenants.byId({ id: 999 }), null);
  assert.equal(await caller.invoices.byId({ id: 999 }), null);
  await assert.rejects(() => caller.invoices.pdf({ id: 999 }), { code: "NOT_FOUND" });
  assert.deepEqual(await caller.notes.list({ propertyId: 999, limit: 10 }), []);
});
for (const role of ["property_manager", "administrator"]) {
  test(`organization selection enforces the ${role} boundary`, async () => {
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 1,
          role,
          accountStatus: "active",
          defaultOrganizationId: 1,
          passwordChangedAt: null,
        }),
      },
      organizationMembership: {
        findFirst: async ({ where }: { where: unknown }) => {
          assert.deepEqual(where, { userId: 1, organization: { slug: "foreign" } });
          return null;
        },
      },
      organization: { findFirst: async () => ({ id: 999, slug: "foreign" }) },
    } as unknown as PrismaClient;
    const context = await createContext(prisma)({
      req: {
        headers: {
          cookie: await createTestSessionCookie("1"),
          "x-parcelis-organization-slug": "foreign",
        },
      },
    });
    if (role === "administrator") assert.equal(context.organization?.organizationId, 999);
    else {
      assert.equal(context.organization, null);
      await assert.rejects(() => appRouter.createCaller(context).properties.list(), { code: "FORBIDDEN" });
    }
  });
}
