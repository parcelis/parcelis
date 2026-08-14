"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home,
  LogOut,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { Select } from "@parcelis/ui";
import { useShortcut } from "./shortcut-provider";
import { apiClient, queryKeys } from "./api-client";
import { ThemeSelector } from "./theme-selector";

const navItems = [
  { label: "Portfolio", href: "/", key: "portfolio", icon: Home },
  { label: "Properties", href: "/properties", key: "properties", icon: Building2 },
  { label: "Leases", href: "#", key: "leases", icon: ClipboardList },
  { label: "Tenants", href: "/tenants", key: "tenants", icon: Users },
  { label: "Maintenance", href: "/maintenance", key: "maintenance", icon: Wrench },
  { label: "Income", href: "/income", key: "income", icon: Banknote },
  { label: "Settings", href: "/settings", key: "settings", icon: Settings },
] as const;

type SidebarProps = {
  active: (typeof navItems)[number]["key"];
};

function setSidebarWidth(collapsed: boolean) {
  document.documentElement.style.setProperty("--parcelis-sidebar-width", collapsed ? "5rem" : "16rem");
}

export function Sidebar({ active }: SidebarProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: () => apiClient.organizations.list.query(),
  });
  const activeOrganizationQuery = useQuery({
    queryKey: queryKeys.organizations.active,
    queryFn: () => apiClient.organizations.active.query(),
  });
  const switchOrganizationMutation = useMutation({
    mutationFn: (organizationId: number) => apiClient.organizations.switch.mutate({ organizationId }),
    onSuccess: async ({ organizationId }) => {
      const membership = organizationsQuery.data?.find(({ organization }) => organization.id === organizationId);
      queryClient.clear();
      if (membership) router.replace(`/o/${membership.organization.slug}`);
      else router.refresh();
    },
  });

  React.useEffect(() => {
    const saved = window.localStorage.getItem("parcelis-sidebar-collapsed") === "true";
    setIsSidebarCollapsed(saved);
    setSidebarWidth(saved);
  }, []);

  React.useEffect(() => {
    const organization = activeOrganizationQuery.data;
    if (organization && !pathname.startsWith(`/o/${organization.slug}`)) {
      const routePath = pathname.replace(/^(?:\/o\/[^/]+)+/, "");
      router.replace(`/o/${organization.slug}${routePath === "/" ? "" : routePath}`);
    }
  }, [activeOrganizationQuery.data, pathname, router]);

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      setIsSidebarHovered(false);
      window.localStorage.setItem("parcelis-sidebar-collapsed", String(next));
      setSidebarWidth(next);
      return next;
    });
  }

  useShortcut("Mod+B", toggleSidebar);

  async function signOut() {
    setSignOutError(null);
    setIsSigningOut(true);
    try {
      await apiClient.auth.logout.mutate();
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  const isSidebarExpanded = !isSidebarCollapsed || isSidebarHovered;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-parcelis-border bg-white px-4 py-6 transition-[width] duration-200 lg:flex lg:flex-col ${
        isSidebarExpanded ? "w-64" : "w-20"
      }`}
      onMouseEnter={() => {
        if (isSidebarCollapsed) setIsSidebarHovered(true);
      }}
      onMouseLeave={() => setIsSidebarHovered(false)}
    >
      <div className="flex items-center justify-between gap-2">
        {!isSidebarExpanded ? (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden">
            <Image
              alt="Parcelis"
              className="h-full w-full object-cover dark:hidden"
              height={1042}
              priority
              src="/brand/parcelis-dark-lettermark.svg"
              width={730}
            />
            <Image
              alt="Parcelis"
              className="hidden h-full w-full object-cover dark:block"
              height={1042}
              priority
              src="/brand/parcelis-light-lettermark.svg"
              width={730}
            />
          </div>
        ) : (
          <Link aria-label="Parcelis portfolio" className="min-w-0" href="/">
            <Image
              alt="Parcelis"
              className="h-auto w-32 dark:hidden"
              height={159}
              priority
              src="/brand/parcelis-light-banner.png"
              width={488}
            />
            <Image
              alt="Parcelis"
              className="hidden h-auto w-32 dark:block"
              height={159}
              priority
              src="/brand/parcelis-dark-banner.png"
              width={488}
            />
          </Link>
        )}
        <button
          aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-parcelis-porcelain"
          onClick={toggleSidebar}
          type="button"
        >
          {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!isSidebarCollapsed && organizationsQuery.data && organizationsQuery.data.length > 0 ? (
        <div className="mt-6">
          {organizationsQuery.data.length > 1 ? (
            <>
              <label
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-parcelis-gray"
                htmlFor="organization-switcher"
              >
                Organization
              </label>
              <Select
                disabled={switchOrganizationMutation.isPending}
                id="organization-switcher"
                onChange={(event) => switchOrganizationMutation.mutate(Number(event.target.value))}
                value={activeOrganizationQuery.data?.id ?? ""}
              >
                {organizationsQuery.data.map(({ organization }) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </Select>
            </>
          ) : null}
          <div
            className={`mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-parcelis-border bg-parcelis-porcelain text-parcelis-green dark:bg-parcelis-charcoal ${
              organizationsQuery.data.length > 1 ? "mt-3" : ""
            }`}
          >
            {activeOrganizationQuery.data?.avatarUrl ? (
              <img
                alt={`${activeOrganizationQuery.data.name} logo`}
                className="h-full w-full object-contain p-4 dark:hidden"
                src={activeOrganizationQuery.data.avatarUrl}
              />
            ) : (
              <Building2 className="h-7 w-7 dark:hidden" />
            )}
            {activeOrganizationQuery.data?.darkAvatarUrl ? (
              <img
                alt={`${activeOrganizationQuery.data.name} dark mode logo`}
                className="hidden h-full w-full object-contain p-4 dark:block"
                src={activeOrganizationQuery.data.darkAvatarUrl}
              />
            ) : activeOrganizationQuery.data?.avatarUrl ? (
              <img
                alt={`${activeOrganizationQuery.data.name} logo`}
                className="hidden h-full w-full object-contain p-4 dark:block"
                src={activeOrganizationQuery.data.avatarUrl}
              />
            ) : (
              <Building2 className="hidden h-7 w-7 dark:block" />
            )}
          </div>
        </div>
      ) : null}

      <nav className="mt-6 flex-1 space-y-1 text-sm font-medium text-parcelis-gray">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              aria-label={item.label}
              className={`flex h-10 items-center gap-3 rounded-md px-3 ${
                isActive ? "bg-parcelis-charcoal text-white" : "hover:bg-parcelis-porcelain"
              } ${!isSidebarExpanded ? "justify-center" : ""}`}
              href={item.href}
              key={item.key}
              title={!isSidebarExpanded ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isSidebarExpanded ? null : <span className="min-w-0 truncate whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        aria-label="Sign out"
        className={`mb-4 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-parcelis-gray hover:bg-parcelis-porcelain ${!isSidebarExpanded ? "justify-center" : ""}`}
        disabled={isSigningOut}
        onClick={signOut}
        title={!isSidebarExpanded ? "Sign out" : undefined}
        type="button"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!isSidebarExpanded ? null : (
          <span className="min-w-0 truncate whitespace-nowrap">{isSigningOut ? "Signing out…" : "Sign out"}</span>
        )}
      </button>
      {signOutError ? (
        <p className="mb-4 text-xs text-red-700" role="alert">
          {signOutError}
        </p>
      ) : null}
      <div className="border-t border-parcelis-border pt-4">
        <ThemeSelector compact={!isSidebarExpanded} />
      </div>
    </aside>
  );
}
