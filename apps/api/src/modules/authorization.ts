import { TRPCError } from "@trpc/server";
import type { UserRole } from "@parcelis/db";

export function requireAdministrator(role: UserRole) {
  if (role !== "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  }
}
