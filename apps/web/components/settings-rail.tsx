"use client";

import Link from "next/link";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { NavigationRail, NavigationRailGroup } from "./navigation-rail";

const items = [
  { href: "/settings", icon: Users, key: "users", label: "Users" },
  { href: "/settings/roles", icon: ShieldCheck, key: "roles", label: "Roles & permissions" },
] as const;

export function SettingsRail({
  active,
  canManageUsers = false,
}: {
  active: "none" | "organization" | (typeof items)[number]["key"];
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
        </NavigationRailGroup>
        {canManageUsers
          ? items.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;
              return (
                <div
                  className={`flex items-center gap-1 rounded-md ${isActive ? "bg-parcelis-green/20 text-parcelis-charcoal" : "hover:bg-parcelis-porcelain"}`}
                  key={item.key}
                >
                  <span className="grid h-8 w-8 place-items-center text-parcelis-gray">
                    <Icon className="h-4 w-4" />
                  </span>
                  <Link className="min-w-0 flex-1 py-2 pr-2 text-sm font-semibold" href={item.href}>
                    {item.label}
                  </Link>
                </div>
              );
            })
          : null}
      </nav>
    </NavigationRail>
  );
}
