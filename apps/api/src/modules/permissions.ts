import { TRPCError } from "@trpc/server";
import {
  permissionActionValues,
  permissionResourceValues,
  supportsPermissionAction,
  type PermissionAction,
  type PermissionFlags,
  type PermissionResource,
  type UserRole,
} from "@parcelis/schemas";
import type { PrismaService } from "./prisma.service";

const actionFields = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  archive: "canArchive",
  delete: "canDelete",
} as const;

function getUserRole(role: string): UserRole {
  if (
    role === "administrator" ||
    role === "property_manager" ||
    role === "lease_manager" ||
    role === "maintenance" ||
    role === "property_owner" ||
    role === "resident_manager"
  ) {
    return role;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to access Properties." });
}

export function requireAdministrator(role: string) {
  if (role !== "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  }
}

export async function getRolePermissions(prisma: PrismaService, role: string) {
  const userRole = getUserRole(role);
  const rows = userRole === "administrator" ? [] : await prisma.rolePermission.findMany({ where: { role: userRole } });

  return Object.fromEntries(
    permissionResourceValues.map((resource) => {
      const row = rows.find((permission) => permission.resource === resource);
      const enabled = userRole === "administrator";
      return [
        resource,
        Object.fromEntries(
          permissionActionValues.flatMap((action) =>
            supportsPermissionAction(resource, action)
              ? [[action, enabled || Boolean(row?.[actionFields[action]])]]
              : [],
          ),
        ) as PermissionFlags,
      ];
    }),
  ) as Record<PermissionResource, PermissionFlags>;
}

export async function requirePermission(
  prisma: PrismaService,
  role: string,
  resource: PermissionResource,
  action: PermissionAction,
) {
  if (!supportsPermissionAction(resource, action)) {
    const resourceLabel = resource.replaceAll("_", " ");
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: you cannot ${action} ${resourceLabel}.`,
    });
  }

  const userRole = getUserRole(role);
  if (userRole === "administrator") return;

  const permission = await prisma.rolePermission.findUnique({
    where: { role_resource: { role: userRole, resource } },
  });

  if (!permission?.[actionFields[action]]) {
    const resourceLabel = resource.replaceAll("_", " ");
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: you cannot ${action} ${resourceLabel}.`,
    });
  }
}

type NoteSubject = {
  propertyId?: number | null;
  unitId?: number | null;
  tenantId?: number | null;
  maintenanceTicketId?: number | null;
  applicationId?: number | null;
  invoiceId?: number | null;
};

export async function requireNotePermission(
  prisma: PrismaService,
  role: string,
  subject: NoteSubject,
  action: Exclude<PermissionAction, "archive">,
) {
  const access: { parent: PermissionResource; notes: PermissionResource } | null = subject.propertyId
    ? { parent: "properties", notes: "property_notes" }
    : subject.unitId
      ? { parent: "units", notes: "unit_notes" }
      : subject.tenantId
        ? { parent: "tenants", notes: "tenant_notes" }
        : subject.applicationId
          ? { parent: "applications", notes: "application_notes" }
          : subject.maintenanceTicketId
            ? { parent: "maintenance", notes: "maintenance_notes" }
            : subject.invoiceId
              ? { parent: "invoices", notes: "invoice_notes" }
              : null;

  if (!access) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A note must belong to a supported record." });
  }

  await requirePermission(prisma, role, access.notes, action);
  await requirePermission(prisma, role, access.parent, "view");
}
