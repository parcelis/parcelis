import Link from "next/link";
import { LayoutDashboard, LayoutTemplate, Send } from "lucide-react";
import { NavigationRail } from "./navigation-rail";

const items = [
  { href: "/applications", icon: LayoutDashboard, key: "applications", label: "Applications" },
  { href: "/applications/templates", icon: LayoutTemplate, key: "templates", label: "Templates" },
  { href: "/applications/request-sent", icon: Send, key: "request-sent", label: "Request sent" },
] as const;

export type ApplicationsRailActive = (typeof items)[number]["key"];

export function ApplicationsRail({ active }: { active: ApplicationsRailActive }) {
  return (
    <NavigationRail title="Applications">
      <nav aria-label="Applications navigation" className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold ${
                isActive
                  ? "bg-parcelis-green/20 text-parcelis-charcoal"
                  : "text-parcelis-gray hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
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
    </NavigationRail>
  );
}
