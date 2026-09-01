"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  ParcelisLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import {
  permissionActionValues,
  permissionCatalog,
  permissionResourceValues,
  notePermissionCatalog,
  type PermissionAction,
  type PermissionFlags,
  type PermissionResource,
} from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { SettingsRail } from "../../../../components/settings-rail";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

type PermissionMatrix = Record<PermissionResource, PermissionFlags>;
type Role = Awaited<ReturnType<typeof apiClient.roles.list.query>>[number];

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function RolesSettingsPage() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({ queryKey: queryKeys.auth.me, queryFn: () => apiClient.auth.me.query() });
  const rolesQuery = useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => apiClient.roles.list.query(),
    enabled: currentUserQuery.data?.user.role === "administrator",
  });
  const [selectedRole, setSelectedRole] = React.useState<Role | null>(null);
  const [draft, setDraft] = React.useState<PermissionMatrix | null>(null);
  const [notesExpanded, setNotesExpanded] = React.useState(true);

  const updatePermissions = useMutation({
    mutationFn: ({ role, permissions }: { role: Role["role"]; permissions: PermissionMatrix }) =>
      apiClient.roles.updatePermissions.mutate({
        role,
        permissions: permissionResourceValues.map((resource) => ({ resource, ...permissions[resource] })),
      }),
    onSuccess: async () => {
      setSelectedRole(null);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["roles", "list"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });

  function selectRole(role: Role) {
    setSelectedRole(role);
    setDraft(
      Object.fromEntries(
        permissionResourceValues.map((resource) => [resource, { ...role.permissions[resource] }]),
      ) as PermissionMatrix,
    );
  }

  function setPermission(resource: PermissionResource, action: PermissionAction, value: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const flags = { ...current[resource], [action]: value };
      if (action === "view" && !value) permissionActionValues.forEach((key) => (flags[key] = false));
      if (action !== "view" && value) flags.view = true;
      return { ...current, [resource]: flags };
    });
  }

  function setAllNotePermissions(action: Exclude<PermissionAction, "archive">, value: boolean) {
    notePermissionCatalog.forEach(({ resource }) => setPermission(resource, action, value));
  }

  function areAllNotePermissionsEnabled(action: Exclude<PermissionAction, "archive">) {
    return notePermissionCatalog.every(({ resource }) => draft?.[resource][action]);
  }

  const canManageUsers = currentUserQuery.data?.user.role === "administrator";

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail active="roles" canManageUsers={canManageUsers} />
            <div className="min-w-0 flex-1">
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Settings</p>
                <h1 className="mt-5 text-3xl font-bold md:text-5xl">Roles & permissions</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  Control which areas each role can access and the actions allowed there.
                </p>
              </section>

              {!canManageUsers ? (
                <Card>
                  <CardContent className="py-8 text-sm text-parcelis-gray">
                    Administrator access is required.
                  </CardContent>
                </Card>
              ) : rolesQuery.isLoading ? (
                <LoadingState label="Loading roles…" />
              ) : rolesQuery.error ? (
                <p className="text-sm font-medium text-red-700">{rolesQuery.error.message}</p>
              ) : selectedRole && draft ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-semibold text-parcelis-charcoal">{formatRole(selectedRole.role)}</h2>
                        <p className="mt-1 text-sm text-parcelis-gray">
                          {selectedRole.role === "administrator"
                            ? "Administrators always have full access."
                            : "Changes apply to every user with this role."}
                        </p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-parcelis-green" />
                    </div>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table className="min-w-[680px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Area</TableHead>
                          {permissionActionValues.map((action) => (
                            <TableHead className="text-center" key={action}>
                              {action.charAt(0).toUpperCase() + action.slice(1)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissionCatalog.map(({ actions, description, label, resource }) => (
                          <TableRow key={resource}>
                            <TableCell>
                              <p className="font-semibold text-parcelis-charcoal">{label}</p>
                              <p className="mt-1 text-xs text-parcelis-gray">{description}</p>
                            </TableCell>
                            {permissionActionValues.map((action) => (
                              <TableCell className="text-center" key={action}>
                                {actions.includes(action) ? (
                                  <Checkbox
                                    aria-label={`${action} ${label}`}
                                    checked={Boolean(draft[resource][action])}
                                    disabled={selectedRole.role === "administrator"}
                                    onCheckedChange={(checked) => setPermission(resource, action, checked === true)}
                                  />
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        <TableRow className="bg-parcelis-porcelain/60 dark:bg-parcelis-charcoal/55">
                          <TableCell>
                            <button
                              aria-expanded={notesExpanded}
                              className="flex items-center gap-2 font-semibold text-parcelis-charcoal"
                              onClick={() => setNotesExpanded((value) => !value)}
                              type="button"
                            >
                              {notesExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              Notes
                            </button>
                            <p className="mt-1 pl-6 text-xs text-parcelis-gray">
                              Set all note scopes together or expand them individually.
                            </p>
                          </TableCell>
                          {permissionActionValues.map((action) => (
                            <TableCell className="text-center" key={action}>
                              {action === "archive" ? (
                                "—"
                              ) : (
                                <Checkbox
                                  aria-label={`${action} all notes`}
                                  checked={areAllNotePermissionsEnabled(action)}
                                  disabled={selectedRole.role === "administrator"}
                                  onCheckedChange={(checked) => setAllNotePermissions(action, checked === true)}
                                />
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                        {notesExpanded
                          ? notePermissionCatalog.map(({ description, label, resource }) => (
                              <TableRow key={resource}>
                                <TableCell className="pl-10">
                                  <p className="font-semibold text-parcelis-charcoal">{label}</p>
                                  <p className="mt-1 text-xs text-parcelis-gray">{description}</p>
                                </TableCell>
                                {permissionActionValues.map((action) => (
                                  <TableCell className="text-center" key={action}>
                                    {action === "archive" ? (
                                      "—"
                                    ) : (
                                      <Checkbox
                                        aria-label={`${action} ${label}`}
                                        checked={Boolean(draft[resource][action])}
                                        disabled={selectedRole.role === "administrator"}
                                        onCheckedChange={(checked) => setPermission(resource, action, checked === true)}
                                      />
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          : null}
                      </TableBody>
                    </Table>
                    <div className="mt-6 flex items-center justify-between gap-3">
                      <Button className="min-w-40" onClick={() => setSelectedRole(null)} variant="secondary">
                        Back
                      </Button>
                      {selectedRole.role !== "administrator" ? (
                        <Button
                          className="min-w-40"
                          disabled={updatePermissions.isPending}
                          onClick={() => updatePermissions.mutate({ role: selectedRole.role, permissions: draft })}
                        >
                          Save permissions
                        </Button>
                      ) : null}
                    </div>
                    {updatePermissions.error ? (
                      <p className="mt-4 text-sm text-red-700">{updatePermissions.error.message}</p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Roles</h2>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Role</TableHead>
                          <TableHead>Visible areas</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rolesQuery.data ?? []).map((role) => (
                          <TableRow key={role.role}>
                            <TableCell className="font-semibold text-parcelis-charcoal">
                              {formatRole(role.role)}
                            </TableCell>
                            <TableCell>
                              {role.role === "administrator"
                                ? "Full access"
                                : `${permissionCatalog.filter(({ resource }) => role.permissions[resource].view).length} of ${permissionCatalog.length}`}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button onClick={() => selectRole(role)} size="sm" variant="secondary">
                                Manage
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
