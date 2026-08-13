"use client";

import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { Card, CardContent } from "@parcelis/ui";

const items = [
  { href: "/settings", icon: Users, key: "users", label: "Users" },
] as const;

export function SettingsRail({ active }: { active: "organization" | (typeof items)[number]["key"] }) {
  return (
    <aside className="w-full shrink-0 md:w-60">
      <Card className="dark:bg-parcelis-slate">
        <CardContent className="p-3">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parcelis-gray">Settings</p>
          <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Settings navigation">
            <div className="min-w-40 md:min-w-0">
              <div className="flex h-10 items-center gap-3 px-3 text-sm font-semibold text-parcelis-charcoal">
                <Building2 className="h-4 w-4 shrink-0" />
                Organization
              </div>
              <Link
                className={`ml-3 flex h-9 items-center gap-3 rounded-md border-l px-3 text-sm font-medium ${
                  active === "organization"
                    ? "border-parcelis-green bg-parcelis-green/20 text-parcelis-charcoal"
                    : "border-parcelis-border text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                }`}
                href="/settings/organization"
              >
                General
              </Link>
            </div>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;
              return (
                <Link
                  className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                    isActive ? "bg-parcelis-green/20 text-parcelis-charcoal" : "text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                  }`}
                  href={item.href}
                  key={item.key}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </CardContent>
      </Card>
    </aside>
  );
}
