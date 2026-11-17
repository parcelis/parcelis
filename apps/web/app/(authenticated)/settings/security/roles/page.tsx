"use client";

import { SettingsPanel, SettingsPanelHeader } from "@parcelis/ui";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import {
  permissionActionValues,
  permissionCatalog as allPermissionCatalog,
  isApplicationResource,
  permissionResourceValues,
  notePermissionCatalog as allNotePermissionCatalog,
  type PermissionAction,
  type PermissionFlags,
  type PermissionResource,
} from "@parcelis/schemas";
import { useFeatureFlags } from "../../../../../components/feature-flags";
import { apiClient, queryKeys } from "../../../../../components/api-client";
import { LoadingState } from "../../../../../components/loading-state";
import { SettingsRail } from "../../../../../components/settings-rail";
import { formatLabel } from "../../../../../lib/format";
import { settingUpdatedMessage } from "../../../../../components/toast-messages";

type PermissionMatrix = Record<PermissionResource, PermissionFlags>;
type Role = Awaited<ReturnType<typeof apiClient.roles.list.query>>[number];

export default function RolesSettingsPage() {
  const flags = useFeatureFlags();
  const permissionCatalog = allPermissionCatalog.filter(
    ({ resource }) => flags.applications || !isApplicationResource(resource),
  );
  const notePermissionCatalog = allNotePermissionCatalog.filter(
    ({ resource }) => flags.applications || !isApplicationResource(resource),
  );
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
        permissions: permissionResourceValues.map((resource) => {
          const flags = permissions[resource];
          return {
            resource,
            view: flags.view ?? false,
            create: flags.create ?? false,
            edit: flags.edit ?? false,
            archive: flags.archive,
            delete: flags.delete ?? false,
          };
        }),
      }),
    onSuccess: async (_result, { role }) => {
      if (selectedRole?.role === role) {
        setSelectedRole(null);
        setDraft(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["roles", "list"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      toast.success(settingUpdatedMessage("Permissions"));
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

  function getNotePermissionState(action: Exclude<PermissionAction, "archive">) {
    const enabledCount = notePermissionCatalog.filter(({ resource }) => draft?.[resource][action]).length;
    if (enabledCount === 0) return false;
    if (enabledCount === notePermissionCatalog.length) return true;
    return "indeterminate" as const;
  }

  const canManageUsers = currentUserQuery.data?.user.role === "administrator";

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

        <div className="parcelis-page-shell">
          <SettingsPanel
            navigation={
              <SettingsRail
                active="roles"
                canManageInvoicing={currentUserQuery.data?.permissions.invoices.view ?? false}
                canManageRoles={canManageUsers}
                canManageUsers={canManageUsers}
              />
            }
            header={
              <SettingsPanelHeader
                title={<>Roles & permissions</>}
                description={<>Control which areas each role can access and the actions allowed there.</>}
              />
            }
          >
            {currentUserQuery.isLoading ? (
              <LoadingState label="Loading account…" />
            ) : !canManageUsers ? (
              <Card>
                <CardContent className="py-8 text-sm text-parcelis-gray">Administrator access is required.</CardContent>
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
                      <h2 className="font-semibold text-parcelis-charcoal">{formatLabel(selectedRole.role)}</h2>
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
                  <div className="overflow-hidden rounded-xl border border-parcelis-border">
                    <Table className="min-w-[680px] [&_tr]:border-parcelis-border [&_td]:px-2 [&_td]:py-2 [&_[role=checkbox]]:size-4 [&_[role=checkbox]_svg]:size-3">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-10 px-2 font-medium text-parcelis-charcoal">Area</TableHead>
                          {permissionActionValues.map((action) => (
                            <TableHead
                              className="h-10 w-20 px-2 text-center font-medium text-parcelis-charcoal"
                              key={action}
                            >
                              {action.charAt(0).toUpperCase() + action.slice(1)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissionCatalog.map(({ actions, description, label, resource }) => (
                          <TableRow key={resource}>
                            <TableCell>
                              <p className="font-medium text-parcelis-charcoal">{label}</p>
                              <p className="mt-0.5 text-xs text-parcelis-gray">{description}</p>
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
                        <TableRow>
                          <TableCell>
                            <button
                              aria-expanded={notesExpanded}
                              className="flex items-center gap-2 font-medium text-parcelis-charcoal"
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
                            <p className="mt-0.5 pl-6 text-xs text-parcelis-gray">
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
                                  checked={getNotePermissionState(action)}
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
                                <TableCell className="!pl-8">
                                  <p className="font-medium text-parcelis-charcoal">{label}</p>
                                  <p className="mt-0.5 text-xs text-parcelis-gray">{description}</p>
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
                  </div>
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
                <CardContent>
                  <div className="overflow-hidden rounded-xl border border-parcelis-border">
                    <Table className="min-w-[440px] [&_tr]:border-parcelis-border [&_td]:px-3 [&_td]:py-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-10 px-3 text-xs font-medium text-parcelis-gray">Role</TableHead>
                          <TableHead className="h-10 px-3 text-xs font-medium text-parcelis-gray">
                            Visible areas
                          </TableHead>
                          <TableHead className="h-10 px-3">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rolesQuery.data ?? []).map((role) => (
                          <TableRow className="hover:bg-parcelis-porcelain/50" key={role.role}>
                            <TableCell className="font-medium text-parcelis-charcoal">
                              {formatLabel(role.role)}
                            </TableCell>
                            <TableCell className="text-parcelis-gray">
                              {role.role === "administrator"
                                ? "Full access"
                                : `${permissionCatalog.filter(({ resource }) => role.permissions[resource].view).length} of ${permissionCatalog.length}`}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                aria-label={`Manage ${formatLabel(role.role)} permissions`}
                                onClick={() => selectRole(role)}
                                size="sm"
                                variant="ghost"
                              >
                                Manage
                                <ChevronRight className="size-4" aria-hidden="true" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </SettingsPanel>
        </div>
      </section>
    </main>
  );
}
