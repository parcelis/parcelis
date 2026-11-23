"use client";

import { useId } from "react";
import Link from "next/link";
import { Building2, KeyRound, Mail, ReceiptText, ShieldCheck, Users } from "lucide-react";
import { Select, SettingsPanelGroup } from "@parcelis/ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { apiClient, queryKeys } from "./api-client";

export function SettingsRail({
  active,
  canManageUsers = false,
  canManageRoles = false,
  canManageInvoicing = false,
}: {
  active: "none" | "organization" | "email" | "api-tokens" | "invoicing" | "roles" | "users";
  canManageRoles?: boolean;
  canManageInvoicing?: boolean;
  canManageUsers?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const selectId = useId();
  const organizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const canManageTokens = ["owner", "administrator"].includes(organizationQuery.data?.role ?? "");
  const groups = [
    {
      label: "Organization",
      items: [
        { key: "organization", href: "/settings/organization/general", label: "General", icon: Building2 },
        { key: "email", href: "/settings/organization/email", label: "Email", icon: Mail },
        ...(canManageTokens
          ? [{ key: "api-tokens", href: "/settings/organization/api-tokens", label: "API tokens", icon: KeyRound }]
          : []),
      ],
    },
    {
      label: "Invoicing",
      items: canManageInvoicing
        ? [{ key: "invoicing", href: "/settings/invoicing", label: "Charges", icon: ReceiptText }]
        : [],
    },
    {
      label: "Security",
      items: [
        ...(canManageRoles ? [{ key: "roles", href: "/settings/security/roles", label: "Roles", icon: ShieldCheck }] : []),
        ...(canManageUsers ? [{ key: "users", href: "/settings/security/users", label: "Users", icon: Users }] : []),
      ],
    },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <div className="md:hidden">
        <label className="sr-only" htmlFor={selectId}>
          Settings section
        </label>
        <Select
          id={selectId}
          value={active}
          onChange={(event) => {
            const item = groups.flatMap((group) => group.items).find((item) => item.key === event.target.value);
            if (item) router.push(item.href);
          }}
        >
          {active === "none" ? (
            <option value="none" disabled>
              Choose a settings section
            </option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <nav aria-label="Settings navigation" className="hidden flex-col gap-6 md:flex">
        {groups.map(({ label, items }) => (
          <SettingsPanelGroup key={label} title={label}>
            {items.map(({ icon: Icon, ...item }) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${active === item.key ? "bg-parcelis-green/20 text-parcelis-charcoal" : "text-parcelis-gray hover:bg-parcelis-porcelain"}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </SettingsPanelGroup>
        ))}
      </nav>
    </>
  );
}
