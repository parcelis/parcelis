import type { PermissionAction, PermissionFlags, PermissionResource } from "@parcelis/schemas";

export function hasPermission(
  permissions: Partial<Record<PermissionResource, PermissionFlags>> | undefined,
  resource: PermissionResource,
  action: PermissionAction,
) {
  return permissions?.[resource]?.[action] ?? false;
}
