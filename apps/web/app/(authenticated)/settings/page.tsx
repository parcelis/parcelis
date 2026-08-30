"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  EllipsisVertical,
  Mail,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ParcelisLogo,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../components/api-client";
import { userRoleValues } from "@parcelis/schemas";
import { LoadingState } from "../../../components/loading-state";
import { CreateUserDrawer, initialCreateUserFormState } from "../../../components/create-user-drawer";
import { EditUserDrawer, type EditUserFormState } from "../../../components/edit-user-drawer";
import { PageRail } from "../../../components/page-rail";
import { hasPermission } from "../../../components/property-access";
import { SettingsRail } from "../../../components/settings-rail";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type UserListItem = Awaited<ReturnType<typeof apiClient.users.list.query>>[number];

function UserActionsMenu({
  canArchive,
  canDelete,
  canEdit,
  onDelete,
  onEdit,
  onToggleAccountStatus,
  user,
}: {
  canArchive: boolean;
  canDelete: boolean;
  canEdit: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleAccountStatus: () => void;
  user: UserListItem;
}) {
  const isDisabled = user.accountStatus === "disabled";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Open actions for ${user.name}`}
          className="inline-grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
          type="button"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {canEdit ? (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="h-4 w-4 text-parcelis-green" />
            Edit
          </DropdownMenuItem>
        ) : null}
        {canArchive ? (
          <DropdownMenuItem onSelect={onToggleAccountStatus}>
            {isDisabled ? (
              <UserRoundCheck className="h-4 w-4 text-parcelis-green" />
            ) : (
              <UserRoundX className="h-4 w-4 text-parcelis-green" />
            )}
            {isDisabled ? "Enable" : "Disable"}
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem className="font-semibold text-red-700 hover:bg-red-50 focus:bg-red-50" onSelect={onDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiClient.auth.me.query(),
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users.list,
    queryFn: () => apiClient.users.list.query(),
    enabled: hasPermission(currentUserQuery.data?.permissions, "users", "view"),
  });
  const users = usersQuery.data ?? [];
  const isAdministrator = currentUserQuery.data?.user.role === "administrator";
  const canViewUsers = hasPermission(currentUserQuery.data?.permissions, "users", "view");
  const canCreateUsers = hasPermission(currentUserQuery.data?.permissions, "users", "create");
  const canEditUsers = hasPermission(currentUserQuery.data?.permissions, "users", "edit");
  const canArchiveUsers = hasPermission(currentUserQuery.data?.permissions, "users", "archive");
  const canDeleteUsers = hasPermission(currentUserQuery.data?.permissions, "users", "delete");
  const canManageUserActions = canEditUsers || canArchiveUsers || canDeleteUsers;
  const availableUserRoles = isAdministrator
    ? userRoleValues
    : userRoleValues.filter((role) => role !== "administrator");
  const activeUsers = usersQuery.data?.filter((user) => user.accountStatus === "active").length;
  const disabledUsers = usersQuery.data?.filter((user) => user.accountStatus === "disabled").length;
  const [editUser, setEditUser] = React.useState<UserListItem | null>(null);
  const [disableUser, setDisableUser] = React.useState<UserListItem | null>(null);
  const [deleteUser, setDeleteUser] = React.useState<UserListItem | null>(null);
  const [isCreateUserDrawerOpen, setIsCreateUserDrawerOpen] = React.useState(false);
  const [createUserForm, setCreateUserForm] = React.useState(initialCreateUserFormState);
  const [editForm, setEditForm] = React.useState<EditUserFormState>({
    name: "",
    email: "",
    phone: "",
    role: "property_manager",
  });
  const updateUserRequest = useMutation({
    mutationFn: (input: EditUserFormState & { id: number }) =>
      apiClient.users.update.mutate({ ...input, phone: input.phone || null }),
    onSuccess: async () => {
      setEditUser(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.list });
    },
  });
  const createUserMutation = useMutation({
    mutationFn: () => apiClient.users.create.mutate({ ...createUserForm, phone: createUserForm.phone || null }),
    onSuccess: async () => {
      setIsCreateUserDrawerOpen(false);
      setCreateUserForm(initialCreateUserFormState);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.list });
    },
  });
  const updateAccountStatusMutation = useMutation({
    mutationFn: ({ accountStatus, id }: { accountStatus: "active" | "disabled"; id: number }) =>
      apiClient.users.updateAccountStatus.mutate({ id, accountStatus }),
    onSuccess: async () => {
      setDisableUser(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.list });
    },
  });
  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiClient.users.delete.mutate({ id }),
    onSuccess: async () => {
      setDeleteUser(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.list });
    },
  });

  function openEdit(user: UserListItem) {
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role ?? "property_manager",
    });
    setEditUser(user);
  }

  return (
    <main className="flex-1">
      <CreateUserDrawer
        canCreateAdministrators={isAdministrator === true}
        error={createUserMutation.error}
        form={createUserForm}
        isPending={createUserMutation.isPending}
        onFormChange={setCreateUserForm}
        onOpenChange={setIsCreateUserDrawerOpen}
        onSubmit={() => createUserMutation.mutate()}
        open={isCreateUserDrawerOpen}
      />
      <EditUserDrawer
        availableRoles={availableUserRoles}
        error={updateUserRequest.error}
        form={editForm}
        isPending={updateUserRequest.isPending}
        onFormChange={setEditForm}
        onOpenChange={(open) => !open && setEditUser(null)}
        onSubmit={() => editUser && updateUserRequest.mutate({ ...editForm, id: editUser.id })}
        open={Boolean(editUser)}
      />
      <AlertDialog onOpenChange={(open) => !open && setDisableUser(null)} open={Boolean(disableUser)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {disableUser?.accountStatus === "disabled" ? "Enable user?" : "Disable user?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {disableUser?.accountStatus === "disabled"
                ? `${disableUser.name} will be able to sign in again.`
                : `${disableUser?.name} will no longer be able to sign in.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setDisableUser(null)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={updateAccountStatusMutation.isPending}
              onClick={() =>
                disableUser &&
                updateAccountStatusMutation.mutate({
                  id: disableUser.id,
                  accountStatus: disableUser.accountStatus === "disabled" ? "active" : "disabled",
                })
              }
              type="button"
            >
              {disableUser?.accountStatus === "disabled" ? "Enable" : "Disable"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={(open) => !open && setDeleteUser(null)} open={Boolean(deleteUser)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteUser?.name}
              {"'s"} account and active sessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setDeleteUser(null)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={deleteUserMutation.isPending}
              onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
          {canCreateUsers ? (
            <Button className="min-w-40" onClick={() => setIsCreateUserDrawerOpen(true)}>
              <UserPlus className="h-4 w-4" />
              New user
            </Button>
          ) : null}
        </header>

        <div className="parcelis-page-shell">
          <div className="flex flex-col gap-6 md:flex-row">
            <SettingsRail active="users" canManageRoles={isAdministrator} canManageUsers={canViewUsers} />
            <div className="min-w-0 flex-1">
              <PageRail description="Review the accounts with access to Parcelis." eyebrow="Settings" title="Users">
                <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-2 md:min-w-[280px]">
                  <div className="rounded-md bg-white/10 p-3">
                    <div className="text-2xl font-bold text-white">{activeUsers ?? "—"}</div>
                    Active accounts
                  </div>
                  <div className="rounded-md bg-white/10 p-3">
                    <div className="text-2xl font-bold text-white">{disabledUsers ?? "—"}</div>
                    Disabled accounts
                  </div>
                </div>
              </PageRail>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">User accounts</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">
                        {users.length} {users.length === 1 ? "account" : "accounts"} created
                      </p>
                    </div>
                    <Users className="h-5 w-5 text-parcelis-green" />
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto p-0">
                  {!canViewUsers ? (
                    <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                      You do not have permission to view the user directory.
                    </div>
                  ) : usersQuery.isLoading ? (
                    <LoadingState label="Loading users…" />
                  ) : usersQuery.error ? (
                    <div className="min-h-48 p-5 text-sm font-medium text-red-700">{usersQuery.error.message}</div>
                  ) : users.length === 0 ? (
                    <div className="min-h-48 p-5 text-sm text-parcelis-gray">No user accounts yet.</div>
                  ) : (
                    <Table className="min-w-[1080px] border-collapse text-left">
                      <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                        <TableRow className="border-0">
                          <TableHead className="px-5 py-3 font-semibold">User</TableHead>
                          <TableHead className="px-5 py-3 font-semibold">Email</TableHead>
                          <TableHead className="px-5 py-3 font-semibold">Phone</TableHead>
                          <TableHead className="px-5 py-3 font-semibold">Role</TableHead>
                          <TableHead className="px-5 py-3 font-semibold">Account Status</TableHead>
                          {canManageUserActions ? (
                            <TableHead className="px-5 py-3 text-right font-semibold">Actions</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow
                            className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60"
                            key={user.id}
                          >
                            <TableCell className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-parcelis-porcelain text-parcelis-green">
                                  <Users className="h-4 w-4" />
                                </div>
                                <Link
                                  className="font-semibold text-parcelis-charcoal hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parcelis-green focus-visible:ring-offset-2"
                                  href={`/settings/profile/${user.id}`}
                                >
                                  {user.name}
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                              <a
                                className="flex items-center gap-2 hover:text-parcelis-charcoal"
                                href={`mailto:${user.email}`}
                              >
                                <Mail className="h-4 w-4 text-parcelis-green" />
                                {user.email}
                              </a>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                              {user.phone ? (
                                <a
                                  className="flex items-center gap-2 hover:text-parcelis-charcoal"
                                  href={`tel:${user.phone}`}
                                >
                                  <Phone className="h-4 w-4 text-parcelis-green" />
                                  {user.phone}
                                </a>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-sm font-medium text-parcelis-charcoal">
                              {formatLabel(user.role)}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <Badge
                                className="w-fit"
                                variant={user.accountStatus === "active" ? "default" : "secondary"}
                              >
                                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                                {formatLabel(user.accountStatus)}
                              </Badge>
                            </TableCell>
                            {canManageUserActions ? (
                              <TableCell className="px-5 py-4 text-right">
                                <UserActionsMenu
                                  canArchive={canArchiveUsers}
                                  canDelete={canDeleteUsers}
                                  canEdit={canEditUsers}
                                  onDelete={() => setDeleteUser(user)}
                                  onEdit={() => openEdit(user)}
                                  onToggleAccountStatus={() => setDisableUser(user)}
                                  user={user}
                                />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
