"use client";

import * as React from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@parcelis/ui";

type NavigationRailProps = {
  children: React.ReactNode;
  title: string;
};

export function NavigationRail({ children, title }: NavigationRailProps) {
  return (
    <aside className="w-full shrink-0 lg:w-60">
      <Card className="lg:sticky lg:top-6 dark:bg-parcelis-slate">
        <CardContent className="p-3">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-parcelis-gray">{title}</p>
          {children}
        </CardContent>
      </Card>
    </aside>
  );
}

type NavigationRailGroupProps = {
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  label: React.ReactNode;
};

export function NavigationRailGroup({ children, defaultOpen = true, icon: Icon, label }: NavigationRailGroupProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div>
      <div className="flex items-center gap-1 rounded-md hover:bg-parcelis-porcelain">
        <button
          aria-expanded={isOpen}
          aria-label={`${typeof label === "string" ? label : "Section"} settings`}
          className="grid h-8 w-8 place-items-center text-parcelis-gray"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-sm font-semibold text-parcelis-charcoal">
          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
          {label}
        </div>
      </div>
      {isOpen ? <div className="ml-3 border-l border-parcelis-border pl-2">{children}</div> : null}
    </div>
  );
}
