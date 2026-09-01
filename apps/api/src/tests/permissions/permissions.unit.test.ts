import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import type { PrismaService } from "../../modules/prisma.service";
import { getRolePermissions, requireNotePermission, requirePermission } from "../../modules/permissions";

function createPrisma(permissions: Record<string, boolean>) {
  return {
    rolePermission: {
      findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) => ({
        canView: permissions[`${where.role_resource.resource}:view`] ?? false,
        canCreate: permissions[`${where.role_resource.resource}:create`] ?? false,
        canEdit: permissions[`${where.role_resource.resource}:edit`] ?? false,
        canArchive: permissions[`${where.role_resource.resource}:archive`] ?? false,
        canDelete: permissions[`${where.role_resource.resource}:delete`] ?? false,
      }),
    },
  } as unknown as PrismaService;
}

test("allows configured invoice actions", async () => {
  for (const action of ["view", "create", "edit", "delete"] as const) {
    await assert.doesNotReject(
      requirePermission(createPrisma({ [`invoices:${action}`]: true }), "property_manager", "invoices", action),
    );
  }
});

test("omits archive from invoice permissions", async () => {
  const prisma = {
    rolePermission: {
      findMany: async () => [{ resource: "invoices", canView: true, canCreate: true, canEdit: true, canDelete: true }],
    },
  } as unknown as PrismaService;

  const permissions = await getRolePermissions(prisma, "property_manager");

  assert.deepEqual(permissions.invoices, { view: true, create: true, edit: true, delete: true });
});

test("denies invoice archive even when a legacy permission is enabled", async () => {
  await assert.rejects(
    requirePermission(createPrisma({ "invoices:archive": true }), "property_manager", "invoices", "archive"),
    (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
  );
});

test("allows configured note actions with parent visibility", async () => {
  for (const action of ["view", "create", "edit", "delete"] as const) {
    await assert.doesNotReject(
      requireNotePermission(
        createPrisma({ [`invoice_notes:${action}`]: true, "invoices:view": true }),
        "property_manager",
        { invoiceId: 1 },
        action,
      ),
    );
  }
});

test("allows administrators to bypass stored permissions", async () => {
  await assert.doesNotReject(requirePermission(createPrisma({}), "administrator", "invoices", "delete"));
  await assert.doesNotReject(requireNotePermission(createPrisma({}), "administrator", { invoiceId: 1 }, "delete"));
});

test("denies invoice note actions without the matching permission", async () => {
  for (const action of ["view", "create", "edit", "delete"] as const) {
    await assert.rejects(
      requireNotePermission(createPrisma({ "invoices:view": true }), "property_manager", { invoiceId: 1 }, action),
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  }
});

test("denies invoice actions without the matching permission", async () => {
  for (const action of ["view", "create", "edit", "delete"] as const) {
    await assert.rejects(
      requirePermission(createPrisma({}), "property_manager", "invoices", action),
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  }
});

test("denies invoice notes without invoice visibility", async () => {
  await assert.rejects(
    requireNotePermission(createPrisma({ "invoice_notes:view": true }), "property_manager", { invoiceId: 1 }, "view"),
    (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
  );
});

test("denies every action for every configured resource by default", async () => {
  const resources = [
    "properties",
    "units",
    "tenants",
    "leases",
    "applications",
    "maintenance",
    "invoices",
    "property_notes",
    "unit_notes",
    "tenant_notes",
    "application_notes",
    "maintenance_notes",
    "invoice_notes",
  ] as const;

  for (const resource of resources) {
    for (const action of ["view", "create", "edit", "archive", "delete"] as const) {
      await assert.rejects(
        requirePermission(createPrisma({}), "property_manager", resource, action),
        (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
      );
    }
  }
});

test("enforces scoped note and parent view permissions for every note subject", async () => {
  const subjects = [
    [{ propertyId: 1 }, "properties", "property_notes"],
    [{ unitId: 1 }, "units", "unit_notes"],
    [{ tenantId: 1 }, "tenants", "tenant_notes"],
    [{ applicationId: 1 }, "applications", "application_notes"],
    [{ maintenanceTicketId: 1 }, "maintenance", "maintenance_notes"],
    [{ invoiceId: 1 }, "invoices", "invoice_notes"],
  ] as const;

  for (const [subject, parent, notes] of subjects) {
    await assert.rejects(
      requireNotePermission(createPrisma({ [`${parent}:view`]: true }), "property_manager", subject, "view"),
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
    await assert.rejects(
      requireNotePermission(createPrisma({ [`${notes}:view`]: true }), "property_manager", subject, "view"),
      (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
    );
  }
});
