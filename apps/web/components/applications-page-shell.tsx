import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@parcelis/ui";
import { ApplicationsRail, type ApplicationsRailActive } from "./applications-rail";


type ApplicationsPageShellProps = {
  active: ApplicationsRailActive;
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
};

export function ApplicationsPageShell({
  active,
  children,
  description,
  icon: Icon,
  title,
}: ApplicationsPageShellProps) {
  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell flex flex-col gap-5 lg:flex-row">
          <ApplicationsRail active={active} />
          <div className="min-w-0 flex-1">
            <section className="rounded-lg bg-parcelis-charcoal p-6 text-white">
              <div className="flex items-center gap-3 text-parcelis-green">
                <Icon className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em]">Applications</p>
              </div>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{description}</p>
            </section>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
