"use client";

import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { NavigationRail, NavigationRailGroup } from "./navigation-rail";

const items = [
  { href: "/settings/roles", key: "roles", label: "Roles" },
  { href: "/settings", key: "users", label: "Users" },
] as const;

export function SettingsRail({
  active,
  canManageUsers = false,
  canManageRoles = false,
}: {
  active: "none" | "organization" | "email" | (typeof items)[number]["key"];
  canManageRoles?: boolean;
  canManageUsers?: boolean;
}) {
  return (
    <NavigationRail title="Settings">
      <nav aria-label="Settings navigation" className="space-y-1">
        <NavigationRailGroup icon={Building2} label="Organization">
          <Link
            className={`block rounded-md px-2 py-1.5 text-xs font-medium ${
              active === "organization"
                ? "bg-parcelis-green/20 text-parcelis-charcoal"
                : "text-parcelis-gray hover:bg-parcelis-porcelain"
            }`}
            href="/settings/organization"
          >
            General
          </Link>
          <Link
            className={`mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium ${
              active === "email"
                ? "bg-parcelis-green/20 text-parcelis-charcoal"
                : "text-parcelis-gray hover:bg-parcelis-porcelain"
            }`}
            href="/settings/organization/email"
          >
            Email
          </Link>
        </NavigationRailGroup>
        {canManageRoles || canManageUsers ? (
          <NavigationRailGroup icon={ShieldCheck} label="Security">
            {items.map((item) =>
              (item.key === "roles" ? canManageRoles : canManageUsers) ? (
                <Link
                  className={`block rounded-md px-2 py-1.5 text-xs font-medium ${
                    active === item.key
                      ? "bg-parcelis-green/20 text-parcelis-charcoal"
                      : "text-parcelis-gray hover:bg-parcelis-porcelain"
                  }`}
                  href={item.href}
                  key={item.key}
                >
                  {item.label}
                </Link>
              ) : null,
            )}
          </NavigationRailGroup>
        ) : null}
      </nav>
    </NavigationRail>
  );
}
