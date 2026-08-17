"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FaDiscord, FaGithub } from "react-icons/fa";
import {
  Banknote,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  CircleUserRound,
  KeyRound,
  Lightbulb,
  Home,
  LogOut,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  PasswordInput,
  Select,
} from "@parcelis/ui";
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

type ChangePasswordForm = {
  currentPassword: string;
  newPassword: string;
  reenterPassword: string;
};

const initialChangePasswordForm: ChangePasswordForm = {
  currentPassword: "",
  newPassword: "",
  reenterPassword: "",
};

function setSidebarWidth(collapsed: boolean) {
  document.documentElement.style.setProperty("--parcelis-sidebar-width", collapsed ? "5rem" : "16rem");
}

function isOrganizationAccessError(error: Error | null) {
  if (!error || !("data" in error) || typeof error.data !== "object" || !error.data) return false;
  return "code" in error.data && error.data.code === "FORBIDDEN";
}

export function Sidebar({ active }: SidebarProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = React.useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false);
  const [changePasswordForm, setChangePasswordForm] = React.useState<ChangePasswordForm>(initialChangePasswordForm);
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: () => apiClient.organizations.list.query(),
  });
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const activeOrganizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const changePasswordMutation = useMutation({
    mutationFn: (input: ChangePasswordForm) => apiClient.auth.changePassword.mutate(input),
    onSuccess: () => {
      setChangePasswordForm(initialChangePasswordForm);
      setIsChangePasswordOpen(false);
    },
  });
  const closeChangePasswordDialog = () => {
    if (changePasswordMutation.isPending) return;
    setIsChangePasswordOpen(false);
    setChangePasswordForm(initialChangePasswordForm);
    changePasswordMutation.reset();
  };
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
    if (organization && !window.location.pathname.startsWith(`/o/${organization.slug}`)) {
      const routePath = pathname.replace(/^(?:\/o\/[^/]+)+/, "");
      router.replace(`/o/${organization.slug}${routePath === "/" ? "" : routePath}`);
    }
    if (isOrganizationAccessError(activeOrganizationQuery.error) && pathname.startsWith("/o/")) {
      document.cookie = "parcelis-organization-slug=; path=/; max-age=0; samesite=lax";
      router.replace("/");
      router.refresh();
    }
  }, [activeOrganizationQuery.data, activeOrganizationQuery.error, pathname, router]);

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

  const isSidebarExpanded = !isSidebarCollapsed || isSidebarHovered || isAccountMenuOpen;

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

      {isSidebarExpanded && organizationsQuery.data && organizationsQuery.data.length > 0 ? (
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
              {switchOrganizationMutation.error ? (
                <p className="mt-2 text-sm font-medium text-red-700" role="alert">
                  {switchOrganizationMutation.error.message}
                </p>
              ) : null}
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

      <Dialog
        onOpenChange={(open) => {
          if (open) setIsChangePasswordOpen(true);
          else closeChangePasswordDialog();
        }}
        open={isChangePasswordOpen}
      >
        <DialogContent aria-labelledby="change-password-title">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (changePasswordForm.newPassword === changePasswordForm.reenterPassword) {
                changePasswordMutation.mutate(changePasswordForm);
              }
            }}
          >
            <div>
              <h2 className="text-lg font-bold text-parcelis-charcoal" id="change-password-title">
                Change password
              </h2>
              <p className="mt-1 text-sm text-parcelis-gray">Use at least 12 characters for your new password.</p>
            </div>
            <div className="grid gap-4">
              <Label>
                Current password
                <PasswordInput
                  autoComplete="current-password"
                  className="mt-1"
                  onChange={(event) =>
                    setChangePasswordForm({ ...changePasswordForm, currentPassword: event.target.value })
                  }
                  required
                  value={changePasswordForm.currentPassword}
                />
              </Label>
              <Label>
                New password
                <PasswordInput
                  autoComplete="new-password"
                  className="mt-1"
                  minLength={12}
                  onChange={(event) =>
                    setChangePasswordForm({ ...changePasswordForm, newPassword: event.target.value })
                  }
                  required
                  value={changePasswordForm.newPassword}
                />
              </Label>
              <Label>
                Re-enter new password
                <PasswordInput
                  aria-describedby={
                    changePasswordForm.reenterPassword &&
                    changePasswordForm.newPassword !== changePasswordForm.reenterPassword
                      ? "password-match-error"
                      : undefined
                  }
                  autoComplete="new-password"
                  className="mt-1"
                  minLength={12}
                  onChange={(event) =>
                    setChangePasswordForm({ ...changePasswordForm, reenterPassword: event.target.value })
                  }
                  required
                  value={changePasswordForm.reenterPassword}
                />
              </Label>
            </div>
            {changePasswordForm.reenterPassword &&
            changePasswordForm.newPassword !== changePasswordForm.reenterPassword ? (
              <p className="text-sm font-medium text-red-700" id="password-match-error" role="alert">
                New passwords do not match.
              </p>
            ) : null}
            {changePasswordMutation.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {changePasswordMutation.error.message}
              </p>
            ) : null}
            {changePasswordMutation.isPending ? (
              <p className="text-sm text-parcelis-gray" role="status">
                Your password update is in progress and cannot be canceled.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={changePasswordMutation.isPending}
                onClick={closeChangePasswordDialog}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  changePasswordMutation.isPending ||
                  changePasswordForm.newPassword !== changePasswordForm.reenterPassword
                }
                type="submit"
              >
                {changePasswordMutation.isPending ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </DialogContent>
        <DropdownMenu onOpenChange={setIsAccountMenuOpen} open={isAccountMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Open account menu"
              className={`group flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-parcelis-gray hover:bg-parcelis-porcelain data-[state=open]:bg-parcelis-porcelain dark:data-[state=open]:bg-parcelis-charcoal/70 ${!isSidebarExpanded ? "justify-center" : ""}`}
              title={!isSidebarExpanded ? "My Account" : undefined}
              type="button"
            >
              <CircleUserRound className="h-4 w-4 shrink-0" />
              {!isSidebarExpanded ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">My Account</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60" side="right">
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <span className="text-sm font-semibold">My Account</span>
              <span className="truncate text-xs font-normal text-parcelis-gray">
                {currentUserQuery.data?.user.name || currentUserQuery.data?.user.email || "Loading account…"}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setIsChangePasswordOpen(true)}>
              <KeyRound className="h-4 w-4 shrink-0" />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/docs/" rel="noopener noreferrer" target="_blank">
                <BookOpen className="h-4 w-4 shrink-0" />
                Documentation Site
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="https://github.com/parcelis/parcelis" rel="noopener noreferrer" target="_blank">
                <FaGithub className="h-4 w-4 shrink-0" />
                GitHub
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://discord.gg/4XYkWmVpWH" rel="noopener noreferrer" target="_blank">
                <FaDiscord className="h-4 w-4 shrink-0" />
                Discord Community
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href="https://github.com/parcelis/parcelis/issues/new?template=feature_request.yml"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Lightbulb className="h-4 w-4 shrink-0" />
                Request a feature
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {signOutError ? (
              <p className="px-3 py-2 text-xs text-red-700" role="alert">
                {signOutError}
              </p>
            ) : null}
            <DropdownMenuItem
              disabled={isSigningOut}
              onSelect={(event) => {
                event.preventDefault();
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-3 py-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-parcelis-gray">Theme</p>
              <ThemeSelector />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </Dialog>
    </aside>
  );
}
