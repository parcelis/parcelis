"use client";

import Link from "next/link";
import { Building2, Users } from "lucide-react";

const items = [
  { href: "/settings/organization", icon: Building2, key: "organization", label: "Organization" },
  { href: "/settings", icon: Users, key: "users", label: "Users" },
] as const;

export function SettingsRail({ active }: { active: (typeof items)[number]["key"] }) {
  return (
    <aside className="w-full shrink-0 md:w-52">
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-parcelis-border bg-white p-2 md:flex-col" aria-label="Settings navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                isActive ? "bg-parcelis-charcoal text-white" : "text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
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
    </aside>
  );
}
