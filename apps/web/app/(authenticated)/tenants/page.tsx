"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgeCheck,
  Archive,
  ArchiveRestore,
  CalendarCheck2,
  EllipsisVertical,
  Eye,
  Filter,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  StickyNote,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Card,
  CardContent,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../components/api-client";
import { LoadingState } from "../../../components/loading-state";
import { NotesDrawer } from "../../../components/notes-drawer";
import { TenantDrawer, initialTenantFormState, type TenantFormState } from "../../../components/tenant-drawer";
import { deleteTenantImage, uploadTenantImage } from "../../../components/tenant-image-upload";
import {
  entityArchivedMessage,
  entityCreatedMessage,
  entityDeletedMessage,
  entityReactivatedMessage,
  entityUpdatedMessage,
} from "../../../components/toast-messages";
import { getTenantLink } from "../../../lib/entity-links";


type TenantFilters = {
  accountStatus: string;
  insuranceStatus: string;
  tenantStatus: string;
};

const initialFilters: TenantFilters = {
  accountStatus: "all",
  insuranceStatus: "all",
  tenantStatus: "all",
};

type TenantListItem = Awaited<ReturnType<typeof apiClient.tenants.list.query>>[number];

function TenantActionsMenu({
  onArchive,
  onDelete,
  onEdit,
  onNotes,
  onReactivate,
  tenant,
}: {
  onArchive: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onNotes: () => void;
  onReactivate: () => void;
  tenant: TenantListItem;
}) {
  const isArchived = tenant.tenantStatus === "archived";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Open actions for ${tenant.firstName} ${tenant.lastName}`}
          className="inline-grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
          type="button"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={getTenantLink(tenant.id)}>
            <Eye className="h-4 w-4 text-parcelis-green" />
            View
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="h-4 w-4 text-parcelis-green" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNotes}>
          <StickyNote className="h-4 w-4 text-parcelis-green" />
          Add Notes
        </DropdownMenuItem>
        {isArchived ? (
          <DropdownMenuItem onSelect={onReactivate}>
            <ArchiveRestore className="h-4 w-4 text-parcelis-green" />
            Unarchive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onArchive}>
            <Archive className="h-4 w-4 text-parcelis-green" />
            Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="font-semibold text-red-700 hover:bg-red-50 focus:bg-red-50" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatStatus(status?: string | null) {
  if (!status) {
    return "Not set";
  }

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status?: string | null) {
  if (status === "active" || status === "activated") {
    return "text-parcelis-green";
  }
  if (status === "archived" || status === "disabled" || status === "expired") {
    return "text-red-700";
  }
  return "text-amber-600";
}

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const tenantsQuery = useQuery({
    queryKey: queryKeys.tenants.list,
    queryFn: () => apiClient.tenants.list.query(),
  });
  const [search, setSearch] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [draftFilters, setDraftFilters] = React.useState<TenantFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = React.useState<TenantFilters>(initialFilters);
  const [archiveTenant, setArchiveTenant] = React.useState<TenantListItem | null>(null);
  const [deleteTenant, setDeleteTenant] = React.useState<TenantListItem | null>(null);
  const [editTenant, setEditTenant] = React.useState<TenantListItem | null>(null);
  const [isTenantDrawerOpen, setIsTenantDrawerOpen] = React.useState(false);
  const [notesTenant, setNotesTenant] = React.useState<TenantListItem | null>(null);
  const [editForm, setEditForm] = React.useState<TenantFormState>(initialTenantFormState);
  const [tenantImageFile, setTenantImageFile] = React.useState<File | null>(null);
  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiClient.tenants.archive.mutate({ id }),
    onSuccess: async (tenant, id) => {
      setArchiveTenant(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(id) }),
      ]);
      toast.success(entityArchivedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: number) => apiClient.tenants.reactivate.mutate({ id }),
    onSuccess: async (tenant, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(id) }),
      ]);
      toast.success(entityReactivatedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
  const createTenantMutation = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: TenantFormState }) => {
      const tenant = await apiClient.tenants.create.mutate(input);
      if (imageFile) await uploadTenantImage(tenant.id, imageFile);
      return tenant;
    },
    onSuccess: async (tenant) => {
      setIsTenantDrawerOpen(false);
      setEditForm(initialTenantFormState);
      setTenantImageFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list });
      toast.success(entityCreatedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
  const updateTenantMutation = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: TenantFormState & { id: number } }) => {
      const tenant = await apiClient.tenants.update.mutate(input);
      if (imageFile) await uploadTenantImage(input.id, imageFile);
      return tenant;
    },
    onSuccess: async (tenant, variables) => {
      setEditTenant(null);
      setEditForm(initialTenantFormState);
      setTenantImageFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tenants.byId(variables.input.id),
        }),
      ]);
      toast.success(entityUpdatedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
  const deleteTenantImageMutation = useMutation({
    mutationFn: deleteTenantImage,
    onSuccess: async (_tenant, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(id) }),
      ]);
    },
  });
  const deleteTenantMutation = useMutation({
    mutationFn: (tenant: TenantListItem) => apiClient.tenants.delete.mutate({ id: tenant.id }),
    onSuccess: async (_tenant, tenant) => {
      setDeleteTenant(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list });
      toast.success(entityDeletedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
  const tenants = tenantsQuery.data ?? [];
  const activeTenants = tenants.filter((tenant) => tenant.tenantStatus === "active");
  const pastTenants = tenants.filter((tenant) => tenant.tenantStatus === "past");
  const archivedTenants = tenants.filter((tenant) => tenant.tenantStatus === "archived");
  const filteredTenants = tenants.filter((tenant) => {
    const activeLease = tenant.leases.find((lease) => lease.status === "active" || lease.status === "notice");
    const query = search.toLowerCase();

    const matchesSearch = [
      tenant.firstName,
      tenant.lastName,
      tenant.email,
      tenant.phone,
      activeLease?.property.name,
      activeLease?.unitLabel,
    ].some((value) => value?.toLowerCase().includes(query));
    const matchesAccountStatus =
      appliedFilters.accountStatus === "all" || tenant.accountStatus === appliedFilters.accountStatus;
    const matchesInsuranceStatus =
      appliedFilters.insuranceStatus === "all" || tenant.insuranceStatus === appliedFilters.insuranceStatus;
    const matchesTenantStatus =
      appliedFilters.tenantStatus === "all" || tenant.tenantStatus === appliedFilters.tenantStatus;

    return matchesSearch && matchesAccountStatus && matchesInsuranceStatus && matchesTenantStatus;
  });
  const activeFilterCount = Object.values(appliedFilters).filter((value) => value !== "all").length;

  function updateFilter<Key extends keyof TenantFilters>(key: Key, value: TenantFilters[Key]) {
    setDraftFilters((filters) => ({ ...filters, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setIsFilterOpen(false);
  }

  function clearFilters() {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setIsFilterOpen(false);
  }

  function openEdit(tenant: TenantListItem) {
    const emergencyContact = tenant.emergencyContacts?.[0];

    setEditTenant(tenant);
    setEditForm({
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      phone: tenant.phone ?? "",
      emergencyContactFirstName: emergencyContact?.firstName ?? "",
      emergencyContactLastName: emergencyContact?.lastName ?? "",
      emergencyContactPhone: emergencyContact?.phone ?? "",
      accountStatus: tenant.accountStatus,
      insuranceStatus: tenant.insuranceStatus,
    });
    setTenantImageFile(null);
    setIsTenantDrawerOpen(true);
  }

  function openCreate() {
    setEditTenant(null);
    setEditForm(initialTenantFormState);
    setTenantImageFile(null);
    setIsTenantDrawerOpen(true);
  }

  function openNotes(tenant: TenantListItem) {
    setNotesTenant(tenant);
  }

  return (
    <main className="flex-1">
      <AlertDialog onOpenChange={(open) => !open && setArchiveTenant(null)} open={Boolean(archiveTenant)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark {archiveTenant?.firstName} {archiveTenant?.lastName} as archived while preserving their
              lease history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setArchiveTenant(null)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={archiveMutation.isPending}
              onClick={() => archiveTenant && archiveMutation.mutate(archiveTenant.id)}
              type="button"
            >
              Archive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={(open) => !open && setDeleteTenant(null)} open={Boolean(deleteTenant)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTenant?.firstName} {deleteTenant?.lastName} and their lease history. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setDeleteTenant(null)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800"
              disabled={deleteTenantMutation.isPending}
              onClick={() => deleteTenant && deleteTenantMutation.mutate(deleteTenant)}
              type="button"
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TenantDrawer
        drawerTitle={editTenant ? "Edit Tenant" : "Add Tenant"}
        error={createTenantMutation.error ?? updateTenantMutation.error}
        form={editForm}
        imageFile={tenantImageFile}
        imageUrl={editTenant?.imageUrl}
        isImageDeletePending={deleteTenantImageMutation.isPending}
        isPending={createTenantMutation.isPending || updateTenantMutation.isPending}
        onFormChange={setEditForm}
        onImageChange={setTenantImageFile}
        onImageDelete={editTenant ? () => deleteTenantImageMutation.mutate(editTenant.id) : undefined}
        onOpenChange={(open) => {
          setIsTenantDrawerOpen(open);
          if (!open) {
            setEditTenant(null);
            setEditForm(initialTenantFormState);
          }
        }}
        onSubmit={(form, imageFile) => {
          if (editTenant) {
            updateTenantMutation.mutate({
              imageFile,
              input: { id: editTenant.id, ...form },
            });
          } else {
            createTenantMutation.mutate({ imageFile, input: form });
          }
        }}
        open={isTenantDrawerOpen}
        submitLabel={editTenant ? "Save" : "Add Tenant"}
      />
      <NotesDrawer
        onOpenChange={(open) => !open && setNotesTenant(null)}
        open={Boolean(notesTenant)}
        subject={notesTenant ? { tenantId: notesTenant.id } : { tenantId: 0 }}
        subjectLabel={notesTenant ? `${notesTenant.firstName} ${notesTenant.lastName}` : "Tenant"}
      />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
          <Button className="min-w-40" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tenant
          </Button>
        </header>

        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Tenants</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Tenant directory</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Review resident contact details, account status, insurance, and current lease standing.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-4 md:min-w-[540px]">
              <Metric label="Tenants" value={tenants.length} />
              <Metric label="Active" value={activeTenants.length} />
              <Metric label="Past" value={pastTenants.length} />
              <Metric label="Archived" value={archivedTenants.length} />
            </div>
          </section>

          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold text-parcelis-charcoal">All Tenants</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name, email, property, unit"
                      value={search}
                    />
                  </label>
                  <Button
                    onClick={() => {
                      setDraftFilters(appliedFilters);
                      setIsFilterOpen((isOpen) => !isOpen);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </Button>
                </div>
                {isFilterOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-3 w-full max-w-2xl rounded-lg border border-parcelis-border bg-white p-5 shadow-lg">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Label className="gap-2">
                        <span>Tenant Status</span>
                        <Select
                          onChange={(event) => updateFilter("tenantStatus", event.target.value)}
                          value={draftFilters.tenantStatus}
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="past">Past</option>
                          <option value="archived">Archived</option>
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>Account Status</span>
                        <Select
                          onChange={(event) => updateFilter("accountStatus", event.target.value)}
                          value={draftFilters.accountStatus}
                        >
                          <option value="all">All statuses</option>
                          <option value="activated">Activated</option>
                          <option value="invitation_pending">Invitation Pending</option>
                          <option value="disabled">Disabled</option>
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>Insurance Status</span>
                        <Select
                          onChange={(event) => updateFilter("insuranceStatus", event.target.value)}
                          value={draftFilters.insuranceStatus}
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="not_on_file">Not on File</option>
                        </Select>
                      </Label>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-parcelis-border pt-4">
                      <button
                        className="text-sm font-semibold text-red-600 hover:underline"
                        onClick={clearFilters}
                        type="button"
                      >
                        Clear Filters
                      </button>
                      <Button onClick={applyFilters} type="button">
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {tenantsQuery.isLoading ? (
                <LoadingState label="Loading tenants…" />
              ) : tenantsQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">{tenantsQuery.error.message}</div>
              ) : filteredTenants.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {tenants.length === 0 ? "No tenants yet." : "No tenants match your search."}
                </div>
              ) : (
                <Table className="min-w-[1240px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-64 px-5 py-3 font-semibold">Tenant</TableHead>
                      <TableHead className="w-72 px-5 py-3 font-semibold">Contact</TableHead>
                      <TableHead className="w-52 px-5 py-3 font-semibold">Current Lease</TableHead>
                      <TableHead className="w-40 px-5 py-3 font-semibold">Account Status</TableHead>
                      <TableHead className="w-40 px-5 py-3 font-semibold">Insurance Status</TableHead>
                      <TableHead className="w-32 px-5 py-3 font-semibold">Tenant Status</TableHead>
                      <TableHead className="w-36 px-5 py-3 font-semibold">Lease Ends</TableHead>
                      <TableHead className="w-20 px-5 py-3 text-right font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.map((tenant) => {
                      const activeLease = tenant.leases.find(
                        (lease) => lease.status === "active" || lease.status === "notice",
                      );
                      return (
                        <TableRow
                          className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60"
                          key={tenant.id}
                        >
                          <TableCell className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-parcelis-porcelain text-parcelis-green">
                                <UserRound className="h-4 w-4" />
                              </div>
                              <Link
                                className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                href={getTenantLink(tenant.id)}
                              >
                                {tenant.firstName} {tenant.lastName}
                              </Link>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            <a
                              className="flex items-center gap-2 hover:text-parcelis-charcoal"
                              href={`mailto:${tenant.email}`}
                            >
                              <Mail className="h-4 w-4 text-parcelis-green" />
                              {tenant.email}
                            </a>
                            {tenant.phone ? (
                              <a
                                className="mt-1 flex items-center gap-2 hover:text-parcelis-charcoal"
                                href={`tel:${tenant.phone}`}
                              >
                                <Phone className="h-4 w-4 text-parcelis-green" />
                                {tenant.phone}
                              </a>
                            ) : null}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {activeLease ? (
                              <>
                                <p className="font-medium text-parcelis-charcoal">{activeLease.property.name}</p>
                                <p>Unit {activeLease.unitLabel}</p>
                              </>
                            ) : (
                              "No current lease"
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-2 font-semibold ${getStatusTone(tenant.accountStatus)}`}
                            >
                              <BadgeCheck className="h-4 w-4" />
                              {formatStatus(tenant.accountStatus)}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-2 font-semibold ${getStatusTone(tenant.insuranceStatus)}`}
                            >
                              <ShieldCheck className="h-4 w-4" />
                              {formatStatus(tenant.insuranceStatus)}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-2 font-semibold ${getStatusTone(tenant.tenantStatus)}`}
                            >
                              <CalendarCheck2 className="h-4 w-4" />
                              {formatStatus(tenant.tenantStatus)}
                            </span>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {activeLease?.endsOn
                              ? formatDate(activeLease.endsOn)
                              : activeLease
                                ? "Month-to-Month"
                                : "—"}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right">
                            <TenantActionsMenu
                              onArchive={() => setArchiveTenant(tenant)}
                              onDelete={() => setDeleteTenant(tenant)}
                              onEdit={() => openEdit(tenant)}
                              onNotes={() => openNotes(tenant)}
                              onReactivate={() => reactivateMutation.mutate(tenant.id)}
                              tenant={tenant}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="text-2xl font-bold text-white">{value}</div>
      {label}
    </div>
  );
}
