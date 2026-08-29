import assert from "node:assert/strict";
import test from "node:test";
import { TRPCError } from "@trpc/server";
import type { PrismaService } from "./prisma.service";
import { requireNotePermission, requirePermission } from "./permissions";

function createPrisma(permissions: Record<string, boolean>) {
  return {
    rolePermission: {
      findUnique: async ({ where }: { where: { role_resource: { resource: string } } }) => ({
        canView: permissions[`${where.role_resource.resource}:view`] ?? false,
        canCreate: permissions[`${where.role_resource.resource}:create`] ?? false,
        canEdit: permissions[`${where.role_resource.resource}:edit`] ?? false,
        canArchive: false,
        canDelete: permissions[`${where.role_resource.resource}:delete`] ?? false,
      }),
    },
  } as unknown as PrismaService;
}

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
    requireNotePermission(
      createPrisma({ "invoice_notes:view": true }),
      "property_manager",
      { invoiceId: 1 },
      "view",
    ),
    (error: unknown) => error instanceof TRPCError && error.code === "FORBIDDEN",
  );
});
