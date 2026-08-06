"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  Users,
  Wrench,
} from "lucide-react";
import { ParcelisLogo } from "@parcelis/ui";
import { useShortcut } from "./shortcut-provider";
import { useTheme, type ThemeMode } from "./theme-provider";
import { apiClient } from "./api-client";

const navItems = [
  { label: "Portfolio", href: "/", key: "portfolio", icon: Home },
  { label: "Properties", href: "/properties", key: "properties", icon: Building2 },
  { label: "Leases", href: "#", key: "leases", icon: ClipboardList },
  { label: "Tenants", href: "/tenants", key: "tenants", icon: Users },
  { label: "Maintenance", href: "/maintenance", key: "maintenance", icon: Wrench },
  { label: "Accounting", href: "#", key: "accounting", icon: Banknote },
  { label: "Settings", href: "/settings", key: "settings", icon: Settings },
] as const;

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

type SidebarProps = {
  active: (typeof navItems)[number]["key"];
};

function setSidebarWidth(collapsed: boolean) {
  document.documentElement.style.setProperty("--parcelis-sidebar-width", collapsed ? "5rem" : "16rem");
}

export function Sidebar({ active }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState<string | null>(null);
  const { mode, setMode } = useTheme();
  const router = useRouter();

  React.useEffect(() => {
    const saved = window.localStorage.getItem("parcelis-sidebar-collapsed") === "true";
    setIsCollapsed(saved);
    setSidebarWidth(saved);
  }, []);

  function toggleSidebar() {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("parcelis-sidebar-collapsed", String(next));
      setSidebarWidth(next);
      return next;
    });
  }

  function cycleTheme() {
    const nextMode: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(nextMode);
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

  const ThemeIcon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[var(--parcelis-sidebar-width)] border-r border-parcelis-border bg-white px-4 py-6 transition-[width] duration-200 lg:flex lg:flex-col">
      <div className="flex items-center justify-between gap-2">
        {isCollapsed ? (
          <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
        ) : (
          <Link aria-label="Parcelis portfolio" className="min-w-0" href="/">
            <Image
              alt="Parcelis"
              className="h-auto w-40 dark:hidden"
              height={159}
              priority
              src="/brand/parcelis-light-banner.png"
              width={488}
            />
            <Image
              alt="Parcelis"
              className="hidden h-auto w-40 dark:block"
              height={159}
              priority
              src="/brand/parcelis-dark-banner.png"
              width={488}
            />
          </Link>
        )}
        <button
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          className="grid h-9 w-9 place-items-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-parcelis-porcelain"
          onClick={toggleSidebar}
          type="button"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="mt-8 flex-1 space-y-1 text-sm font-medium text-parcelis-gray">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              aria-label={item.label}
              className={`flex h-10 items-center gap-3 rounded-md px-3 ${
                isActive ? "bg-parcelis-charcoal text-white" : "hover:bg-parcelis-porcelain"
              } ${isCollapsed ? "justify-center" : ""}`}
              href={item.href}
              key={item.key}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {isCollapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-parcelis-border pt-4">
        <button
          aria-label="Sign out"
          className={`mb-4 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-parcelis-gray hover:bg-parcelis-porcelain ${isCollapsed ? "justify-center" : ""}`}
          disabled={isSigningOut}
          onClick={signOut}
          title={isCollapsed ? "Sign out" : undefined}
          type="button"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {isCollapsed ? null : <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>}
        </button>
        {signOutError ? (
          <p className="mb-4 text-xs text-red-700" role="alert">
            {signOutError}
          </p>
        ) : null}
        {isCollapsed ? (
          <button
            aria-label="Cycle theme"
            className="grid h-10 w-full place-items-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-parcelis-porcelain"
            onClick={cycleTheme}
            title={`Theme: ${mode}`}
            type="button"
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-parcelis-gray">
              <ThemeIcon className="h-4 w-4" />
              Theme
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-parcelis-border bg-parcelis-porcelain p-1">
              {(["light", "dark", "system"] as const).map((themeMode) => {
                const Icon = themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor;
                return (
                  <button
                    aria-pressed={mode === themeMode}
                    className={`grid h-8 place-items-center rounded text-xs font-semibold ${
                      mode === themeMode
                        ? "bg-white text-parcelis-charcoal shadow-sm"
                        : "text-parcelis-gray hover:bg-white/60"
                    }`}
                    key={themeMode}
                    onClick={() => setMode(themeMode)}
                    title={themeMode}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
