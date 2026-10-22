"use client";

import Link from "next/link";
import { Building2, ReceiptText, ShieldCheck } from "lucide-react";
import { NavigationRail, NavigationRailGroup } from "./navigation-rail";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { apiClient, queryKeys } from "./api-client";

const items = [
  { href: "/settings/roles", key: "roles", label: "Roles" },
  { href: "/settings", key: "users", label: "Users" },
] as const;

export function SettingsRail({
  active,
  canManageUsers = false,
  canManageRoles = false,
  canManageInvoicing = false,
}: {
  active: "none" | "organization" | "email" | "api-tokens" | "invoicing" | (typeof items)[number]["key"];
  canManageRoles?: boolean;
  canManageInvoicing?: boolean;
  canManageUsers?: boolean;
}) {
  const pathname = usePathname();

  const organizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });

  const canManageTokens = ["owner", "administrator"].includes(organizationQuery.data?.role ?? "");
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
          {canManageTokens ? (
            <Link
              className={`mt-1 block rounded-md px-2 py-1.5 text-xs font-medium ${
                active === "api-tokens"
                  ? "bg-parcelis-green/20 text-parcelis-charcoal"
                  : "text-parcelis-gray hover:bg-parcelis-porcelain"
              }`}
              href="/settings/organization/api-tokens"
              aria-current={active === "api-tokens" ? "page" : undefined}
            >
              API tokens
            </Link>
          ) : null}
        </NavigationRailGroup>
        {canManageInvoicing ? (
          <NavigationRailGroup icon={ReceiptText} label="Invoicing">
            <Link
              className={`block rounded-md px-2 py-1.5 text-xs font-medium ${active === "invoicing" ? "bg-parcelis-green/20 text-parcelis-charcoal" : "text-parcelis-gray hover:bg-parcelis-porcelain"}`}
              href="/settings/invoicing"
            >
              Charges
            </Link>
          </NavigationRailGroup>
        ) : null}
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
