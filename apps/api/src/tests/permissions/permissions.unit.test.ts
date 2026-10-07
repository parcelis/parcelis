import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import { getFeatureFlags, roleResourcePermissionSchema } from "@parcelis/schemas";
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

test("uses a role-agnostic denial for an unrecognized role", async () => {
  await assert.rejects(
    requirePermission(createPrisma({}), "unknown_role", "invoices", "view"),
    (error: unknown) =>
      error instanceof TRPCError &&
      error.code === "FORBIDDEN" &&
      error.message === "Your role does not have permission to access this resource.",
  );
});

test("allows an explicitly disabled archive permission for unsupported resources", () => {
  const input = { resource: "invoices", view: false, create: false, edit: false, archive: false, delete: false };

  assert.equal(roleResourcePermissionSchema.safeParse(input).success, true);
  assert.equal(roleResourcePermissionSchema.safeParse({ ...input, archive: true }).success, false);
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
    "users",
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

test("applications require explicit enablement, including administrator and note access", async () => {
  const previous = process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
  try {
    for (const value of [undefined, "false", "1", "TRUE"]) {
      if (value === undefined) delete process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
      else process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = value;
      assert.equal(getFeatureFlags(process.env).applications, false);
      for (const role of ["administrator", "property_manager"]) {
        for (const resource of ["applications", "application_notes"] as const) {
          for (const action of ["view", "create", "edit", "delete"] as const) {
            await assert.rejects(
              requirePermission(createPrisma({ [`${resource}:${action}`]: true }), role, resource, action),
              (error: unknown) => error instanceof TRPCError && error.message === "Applications are disabled.",
            );
          }
        }
        await assert.rejects(
          requireNotePermission(
            createPrisma({ "applications:view": true, "application_notes:view": true }),
            role,
            { applicationId: 1 },
            "view",
          ),
          (error: unknown) => error instanceof TRPCError && error.message === "Applications are disabled.",
        );
      }
    }
    process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = "true";
    assert.equal(getFeatureFlags(process.env).applications, true);
    await assert.doesNotReject(requirePermission(createPrisma({}), "administrator", "applications", "view"));
    await assert.doesNotReject(
      requireNotePermission(
        createPrisma({ "applications:view": true, "application_notes:view": true }),
        "property_manager",
        { applicationId: 1 },
        "view",
      ),
    );
    await assert.rejects(requirePermission(createPrisma({}), "property_manager", "applications", "view"));
  } finally {
    if (previous === undefined) delete process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
    else process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = previous;
  }
});

test("disabled applications report no effective grants and restore stored grants when enabled", async () => {
  const previous = process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
  const prisma = {
    rolePermission: {
      findMany: async () =>
        ["applications", "application_notes", "properties"].map((resource) => ({
          resource,
          canView: true,
          canCreate: true,
          canEdit: true,
          canArchive: true,
          canDelete: true,
        })),
    },
  } as unknown as PrismaService;
  try {
    for (const value of ["false", "true"]) {
      process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = value;
      for (const role of ["administrator", "property_manager"]) {
        const permissions = await getRolePermissions(prisma, role);
        for (const resource of ["applications", "application_notes"] as const) {
          assert.ok(Object.values(permissions[resource]).every((grant) => grant === (value === "true")));
        }
        assert.equal(permissions.properties.view, true);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.FEATURE_FLAG_APPLICATIONS_ENABLED;
    else process.env.FEATURE_FLAG_APPLICATIONS_ENABLED = previous;
  }
});
