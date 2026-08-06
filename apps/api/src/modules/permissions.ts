import { TRPCError } from "@trpc/server";
import type { PrismaService } from "./prisma.service";

const propertyAccessRank = {
  none: 0,
  view: 1,
  edit: 2,
  delete: 3,
  all: 4,
} as const;

type PropertyAccessLevel = keyof typeof propertyAccessRank;
type UserRole = "administrator" | "property_manager" | "lease_manager" | "maintenance" | "property_owner" | "resident_manager";

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

export async function requirePropertyAccess(
  prisma: PrismaService,
  role: string,
  minimumAccess: PropertyAccessLevel,
) {
  const permission = await prisma.rolePermission.findUnique({ where: { role: getUserRole(role) } });
  const propertyAccess = permission?.propertyAccess ?? "none";

  if (propertyAccessRank[propertyAccess] < propertyAccessRank[minimumAccess]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to access Properties." });
  }
}
