import { TRPCError } from "@trpc/server";

export function requireAdministrator(role: string) {
  if (role !== "administrator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  }
}
