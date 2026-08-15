import { TRPCError } from "@trpc/server";
import type { OrganizationMemberRole, UserRole } from "@parcelis/db";

export function requireAdministrator(role: UserRole) {
  if (role !== "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  }
}

export function requireOrganizationAdministrator(role: OrganizationMemberRole) {
  if (role !== "owner" && role !== "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization administrator access is required." });
  }
}
