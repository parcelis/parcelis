"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Coins,
  Mail,
  PenLine,
  Phone,
  Save,
  ScrollText,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  Label,
  ParcelisLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../components/api-client";
import { Sidebar } from "../../../components/sidebar";
import { deleteTenantImage, uploadTenantImage } from "../../../components/tenant-image-upload";
import { TenantDrawer, initialTenantFormState, type TenantFormState } from "../../../components/tenant-drawer";
import { LoadingState } from "../../../components/loading-state";
import { NotesDrawer } from "../../../components/notes-drawer";
import { EntityLifecycleControls } from "../../../components/entity-lifecycle-controls";
import { StickyNotePlusIcon } from "../../../components/sticky-note-plus-icon";
import { getPropertyLink, getTenantInvoiceLink, getTenantInvoicesLink } from "../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatStatus(status?: string | null) {
  if (!status) return "Not set";

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status?: string | null) {
  if (status === "active" || status === "activated") return "text-parcelis-green";
  if (status === "archived" || status === "disabled" || status === "expired") return "text-red-700";
  return "text-amber-600";
}

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tenantId = Number(params.id);
  const [isEmergencyContactOpen, setIsEmergencyContactOpen] = useState(false);
  const [isEmergencyContactDrawerOpen, setIsEmergencyContactDrawerOpen] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [isTenantDrawerOpen, setIsTenantDrawerOpen] = useState(false);
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
  const [tenantForm, setTenantForm] = useState<TenantFormState>(initialTenantFormState);
  const [tenantImageFile, setTenantImageFile] = useState<File | null>(null);
  const [emergencyContactDraft, setEmergencyContactDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const queryClient = useQueryClient();
  const tenantQuery = useQuery({
    queryKey: queryKeys.tenants.byId(tenantId),
    queryFn: () => apiClient.tenants.byId.query({ id: tenantId }),
    enabled: Number.isInteger(tenantId) && tenantId > 0,
  });
  const tenant = tenantQuery.data;
  const emergencyContact = tenant?.emergencyContacts?.[0];
  const updateEmergencyContactMutation = useMutation({
    mutationFn: (input: { id: number; firstName: string; lastName: string; phone: string }) =>
      apiClient.tenants.updateEmergencyContact.mutate(input),
    onSuccess: async () => {
      setIsEmergencyContactDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) });
    },
  });
  const updateTenantMutation = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: TenantFormState & { id: number } }) => {
      const updatedTenant = await apiClient.tenants.update.mutate(input);
      if (imageFile) await uploadTenantImage(input.id, imageFile);
      return updatedTenant;
    },
    onSuccess: async () => {
      setIsTenantDrawerOpen(false);
      setTenantImageFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
      ]);
    },
  });
  const deleteTenantImageMutation = useMutation({
    mutationFn: deleteTenantImage,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
      ]);
    },
  });
  const currentLease = tenant?.leases.find((lease) => lease.status === "active" || lease.status === "notice");
  const overdueCents = currentLease?.amountOverdueCents ?? 0;
  const currentInvoiceCents = currentLease?.monthlyRentCents ?? 0;
  const rentCollectedCents = Math.max(currentInvoiceCents - overdueCents, 0);
  const otherCollectedCents = 0;
  const totalCollectedCents = rentCollectedCents + otherCollectedCents;
  const currentInvoiceId = currentLease
    ? `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
    : null;
  const pastDueInvoiceId = currentInvoiceId ? `${currentInvoiceId}-OVERDUE` : null;

  function openTenantDrawer() {
    if (!tenant) return;

    const tenantEmergencyContact = tenant.emergencyContacts?.[0];
    setTenantForm({
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      phone: tenant.phone ?? "",
      emergencyContactFirstName: tenantEmergencyContact?.firstName ?? "",
      emergencyContactLastName: tenantEmergencyContact?.lastName ?? "",
      emergencyContactPhone: tenantEmergencyContact?.phone ?? "",
      accountStatus: tenant.accountStatus,
      insuranceStatus: tenant.insuranceStatus,
    });
    setTenantImageFile(null);
    setIsTenantDrawerOpen(true);
  }

  return (
    <main className="flex-1">
      {emergencyContact ? (
        <Dialog onOpenChange={setIsEmergencyContactOpen} open={isEmergencyContactOpen}>
          <DialogContent className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-parcelis-charcoal">Emergency Contact</h2>
            <dl className="mt-5 grid gap-4 text-sm">
              <div>
                <dt className="text-parcelis-gray">First Name</dt>
                <dd className="font-semibold text-parcelis-charcoal">{emergencyContact.firstName}</dd>
              </div>
              <div>
                <dt className="text-parcelis-gray">Last Name</dt>
                <dd className="font-semibold text-parcelis-charcoal">{emergencyContact.lastName ?? "Not provided"}</dd>
              </div>
              <div>
                <dt className="text-parcelis-gray">Phone</dt>
                <dd>
                  {emergencyContact.phone ? (
                    <a
                      className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                      href={`tel:${emergencyContact.phone}`}
                    >
                      {emergencyContact.phone}
                    </a>
                  ) : (
                    <span className="font-semibold text-parcelis-charcoal">Not provided</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => {
                  setEmergencyContactDraft({
                    firstName: emergencyContact.firstName,
                    lastName: emergencyContact.lastName ?? "",
                    phone: emergencyContact.phone ?? "",
                  });
                  setIsEmergencyContactOpen(false);
                  setIsEmergencyContactDrawerOpen(true);
                }}
                size="sm"
                type="button"
              >
                Edit Contact
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
      <Drawer onOpenChange={setIsEmergencyContactDrawerOpen} open={isEmergencyContactDrawerOpen}>
        <DrawerContent size="sm">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (emergencyContact) {
                updateEmergencyContactMutation.mutate({ id: emergencyContact.id, ...emergencyContactDraft });
              }
            }}
          >
            <DrawerHeader className="flex items-center gap-3">
              <DrawerClose />
              <DrawerTitle>Edit Emergency Contact</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-5 px-4 py-5 md:grid-cols-2 md:px-6">
                <Label>
                  First Name
                  <Input
                    className="mt-1"
                    onChange={(event) =>
                      setEmergencyContactDraft({ ...emergencyContactDraft, firstName: event.target.value })
                    }
                    required
                    value={emergencyContactDraft.firstName}
                  />
                </Label>
                <Label>
                  Last Name
                  <Input
                    className="mt-1"
                    onChange={(event) =>
                      setEmergencyContactDraft({ ...emergencyContactDraft, lastName: event.target.value })
                    }
                    value={emergencyContactDraft.lastName}
                  />
                </Label>
                <Label className="sm:col-span-2">
                  Phone
                  <Input
                    className="mt-1"
                    onChange={(event) =>
                      setEmergencyContactDraft({ ...emergencyContactDraft, phone: event.target.value })
                    }
                    type="tel"
                    value={emergencyContactDraft.phone}
                  />
                </Label>
              </div>
              {updateEmergencyContactMutation.error ? (
                <p className="mt-4 text-sm font-medium text-red-700">{updateEmergencyContactMutation.error.message}</p>
              ) : null}
            </div>
            <DrawerFooter className="flex items-center justify-between gap-3">
              <Button
                className="min-w-40"
                onClick={() => setIsEmergencyContactDrawerOpen(false)}
                type="button"
                variant="secondary"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
              <Button className="min-w-40" disabled={updateEmergencyContactMutation.isPending} type="submit">
                <Save className="h-4 w-4" />
                Save Contact
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
      <TenantDrawer
        drawerTitle="Edit Tenant"
        error={updateTenantMutation.error}
        form={tenantForm}
        imageFile={tenantImageFile}
        imageUrl={tenant?.imageUrl}
        isImageDeletePending={deleteTenantImageMutation.isPending}
        isPending={updateTenantMutation.isPending}
        onFormChange={setTenantForm}
        onImageChange={setTenantImageFile}
        onImageDelete={() => deleteTenantImageMutation.mutate(tenantId)}
        onOpenChange={setIsTenantDrawerOpen}
        onSubmit={(form, imageFile) =>
          updateTenantMutation.mutate({
            imageFile,
            input: { id: tenantId, ...form },
          })
        }
        open={isTenantDrawerOpen}
        submitLabel="Save"
      />
      <NotesDrawer
        onOpenChange={setIsNotesDrawerOpen}
        open={isNotesDrawerOpen}
        subject={{ tenantId }}
        subjectLabel={tenant ? `${tenant.firstName} ${tenant.lastName}` : "Tenant"}
        tenantSummary={
          tenant
            ? {
                name: `${tenant.firstName} ${tenant.lastName}`,
                email: tenant.email,
                phone: tenant.phone,
              }
            : undefined
        }
      />
      {tenant?.imageUrl ? (
        <Dialog onOpenChange={setIsImagePreviewOpen} open={isImagePreviewOpen}>
          <DialogContent
            aria-label={`${tenant.firstName} ${tenant.lastName} image`}
            className="w-fit max-w-[90vw] place-items-center border-0 bg-transparent p-0 shadow-none [&>button]:right-3 [&>button]:top-3 [&>button]:grid [&>button]:h-8 [&>button]:w-8 [&>button]:place-items-center [&>button]:rounded-md [&>button]:border [&>button]:border-parcelis-border [&>button]:bg-white [&>button]:p-0 [&>button]:!text-slate-900 [&>button]:opacity-100 [&>button:hover]:bg-parcelis-porcelain [&>button:hover]:!text-slate-950"
          >
            <img
              alt={`${tenant.firstName} ${tenant.lastName}`}
              className="max-h-[85vh] max-w-[90vw] rounded-md object-contain"
              src={tenant.imageUrl}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      <Sidebar active="tenants" />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-10 sm:min-w-40" variant="secondary">
              <Link href="/tenants">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only">Tenants</span>
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <EntityLifecycleControls
              archiveDescription={
                <>
                  This will mark {tenant ? `${tenant.firstName} ${tenant.lastName}` : "this tenant"} as archived while
                  preserving their lease history.
                </>
              }
              cancelDeleteLabel="Keep Tenant"
              deleteDescription={
                <>
                  This permanently deletes {tenant ? `${tenant.firstName} ${tenant.lastName}` : "this tenant"} and their
                  lease history. This cannot be undone.
                </>
              }
              entityLabel="tenant"
              isArchived={tenant?.tenantStatus === "archived"}
              isAvailable={Boolean(tenant)}
              onArchive={() => apiClient.tenants.archive.mutate({ id: tenantId })}
              onArchiveSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
                ]);
                router.push("/tenants");
              }}
              onDelete={() => apiClient.tenants.delete.mutate({ id: tenantId })}
              onDeleteSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
                ]);
                router.push("/tenants");
              }}
              onReactivate={() => apiClient.tenants.reactivate.mutate({ id: tenantId })}
              onReactivateSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.byId(tenantId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list }),
                ]);
              }}
            />
            <Button
              aria-label="Add notes"
              className="min-w-10 sm:min-w-40"
              disabled={!tenant}
              onClick={() => setIsNotesDrawerOpen(true)}
              variant="secondary"
            >
              <StickyNotePlusIcon />
              <span className="hidden sm:inline">Add Notes</span>
            </Button>
            <Button
              aria-label="Edit tenant"
              className="min-w-10 sm:min-w-40"
              disabled={!tenant}
              onClick={openTenantDrawer}
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden sm:inline">Edit tenant</span>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          {tenantQuery.isLoading ? (
            <LoadingState className="min-h-[60vh]" label="Loading tenant" />
          ) : tenantQuery.error ? (
            <Card>
              <CardContent>
                <p className="text-sm font-medium text-red-700">{tenantQuery.error.message}</p>
              </CardContent>
            </Card>
          ) : !tenant ? (
            <Card>
              <CardContent>
                <p className="text-sm text-parcelis-gray">Tenant not found.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    {tenant.imageUrl ? (
                      <button
                        aria-label={`View ${tenant.firstName} ${tenant.lastName} image`}
                        className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-white/10 text-parcelis-green transition hover:ring-2 hover:ring-parcelis-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green"
                        onClick={() => setIsImagePreviewOpen(true)}
                        type="button"
                      >
                        <img
                          alt={`${tenant.firstName} ${tenant.lastName}`}
                          className="h-full w-full rounded-full object-cover"
                          src={tenant.imageUrl}
                        />
                      </button>
                    ) : (
                      <div className="grid h-28 w-28 place-items-center rounded-full bg-white/10 text-parcelis-green">
                        <UserRound className="h-10 w-10" />
                      </div>
                    )}
                    <h1 className="mt-5 text-3xl font-bold md:text-5xl">
                      {tenant.firstName} {tenant.lastName}
                    </h1>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-sm font-semibold hover:bg-white/15"
                        href={`mailto:${tenant.email}`}
                      >
                        <Mail className="h-4 w-4 text-parcelis-green" />
                        {tenant.email}
                      </a>
                      {tenant.phone ? (
                        <a
                          className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-2 text-sm font-semibold hover:bg-white/15"
                          href={`tel:${tenant.phone}`}
                        >
                          <Phone className="h-4 w-4 text-parcelis-green" />
                          {tenant.phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full lg:w-[36rem]">
                    <div className="grid w-full gap-3 sm:grid-cols-3">
                      <HeroStatus icon={BadgeCheck} label="Account Status" status={tenant.accountStatus} />
                      <HeroStatus icon={ShieldCheck} label="Insurance Status" status={tenant.insuranceStatus} />
                      <HeroStatus icon={CalendarDays} label="Tenant Status" status={tenant.tenantStatus} />
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-5 md:grid-cols-3">
                <MetricCard
                  icon={Building2}
                  label="Current Lease"
                  value={currentLease ? currentLease.property.name : "None"}
                  detail={
                    currentLease ? (
                      <div>
                        <p>Unit {currentLease.unitLabel}</p>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                          <span>
                            <span className="font-semibold text-parcelis-charcoal">Start</span>{" "}
                            {formatDate(currentLease.startsOn)}
                          </span>
                          <span className="text-right">
                            <span className="font-semibold text-parcelis-charcoal">End</span>{" "}
                            {currentLease.endsOn ? formatDate(currentLease.endsOn) : "Month-to-Month"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      "No active agreement"
                    )
                  }
                />
                <MetricCard
                  icon={CircleDollarSign}
                  label="Monthly Rent"
                  value={currentLease ? formatCurrency(currentLease.monthlyRentCents) : "—"}
                  detail={overdueCents > 0 ? `${formatCurrency(overdueCents)} overdue` : "No balance overdue"}
                />
                <MetricCard
                  icon={ScrollText}
                  label="Lease History"
                  value={String(tenant.leases.length)}
                  detail={`${tenant.leases.filter((lease) => lease.status === "ended").length} completed`}
                />
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <Card className="lg:order-2">
                  <CardHeader className="flex items-center justify-between gap-3 sm:flex-row">
                    <h2 className="font-semibold text-parcelis-charcoal">Collection</h2>
                    <Link
                      className="text-sm font-medium text-parcelis-green hover:underline"
                      href={getTenantInvoicesLink(tenant.id)}
                    >
                      View All Invoices
                    </Link>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-8 md:grid-cols-2 md:gap-16">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center text-parcelis-green sm:h-16 sm:w-16">
                          <Coins className="h-5 w-5 sm:h-10 sm:w-10" />
                        </div>
                        <div className="space-y-6">
                          <div>
                            <p className="text-sm font-medium text-parcelis-gray">Current Invoices</p>
                            {currentInvoiceId ? (
                              <Link
                                className="mt-1 inline-block text-base font-bold text-parcelis-green hover:underline"
                                href={getTenantInvoiceLink(tenant.id, currentInvoiceId)}
                              >
                                {currentInvoiceId}
                              </Link>
                            ) : (
                              <p className="mt-1 text-base font-bold text-parcelis-charcoal">No Record found.</p>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-parcelis-gray">Past Due Invoices</p>
                            {overdueCents > 0 && pastDueInvoiceId ? (
                              <Link
                                className="mt-1 inline-block text-base font-bold text-parcelis-green hover:underline"
                                href={getTenantInvoiceLink(tenant.id, pastDueInvoiceId)}
                              >
                                {pastDueInvoiceId}
                              </Link>
                            ) : (
                              <p className="mt-1 text-base font-bold text-parcelis-charcoal">No Record found.</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <CollectionMetric label="Total Rent Collected" value={formatCurrency(rentCollectedCents)} />
                        <CollectionMetric label="Other Collected" value={formatCurrency(otherCollectedCents)} />
                        <CollectionMetric label="Total" value={formatCurrency(totalCollectedCents)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col lg:order-1">
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Contact Information</h2>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col text-sm">
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-parcelis-gray">Name</p>
                          <p className="font-semibold text-parcelis-charcoal">
                            {tenant.firstName} {tenant.lastName}
                          </p>
                        </div>
                        <div>
                          <p className="text-parcelis-gray">Phone</p>
                          <p className="font-semibold text-parcelis-charcoal">{tenant.phone ?? "Not provided"}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-parcelis-gray">Email</p>
                        <a
                          className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                          href={`mailto:${tenant.email}`}
                        >
                          {tenant.email}
                        </a>
                      </div>
                      {tenant.archivedAt ? (
                        <div>
                          <p className="text-parcelis-gray">Archived</p>
                          <p className="font-semibold text-parcelis-charcoal">{formatDate(tenant.archivedAt)}</p>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-auto border-t border-parcelis-border pt-4">
                      <p className="text-parcelis-gray">Emergency Contact</p>
                      {emergencyContact ? (
                        <button
                          className="font-semibold text-parcelis-green hover:underline"
                          onClick={() => setIsEmergencyContactOpen(true)}
                          type="button"
                        >
                          {emergencyContact.firstName} {emergencyContact.lastName ?? ""}
                        </button>
                      ) : (
                        <p className="font-semibold text-parcelis-charcoal">Not provided</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Lease History</h2>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    {tenant.leases.length === 0 ? (
                      <p className="p-5 text-sm text-parcelis-gray">No lease history is available.</p>
                    ) : (
                      <Table className="min-w-[680px] text-left">
                        <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                          <TableRow className="border-0">
                            <TableHead className="px-5 py-3 font-semibold">Property</TableHead>
                            <TableHead className="px-5 py-3 font-semibold">Term</TableHead>
                            <TableHead className="px-5 py-3 font-semibold">Rent</TableHead>
                            <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tenant.leases.map((lease) => (
                            <TableRow className="border-t border-parcelis-border" key={lease.id}>
                              <TableCell className="px-5 py-4">
                                <Link
                                  className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                  href={getPropertyLink(lease.property.id)}
                                >
                                  {lease.property.name}
                                </Link>
                                <p className="mt-1 text-sm text-parcelis-gray">Unit {lease.unitLabel}</p>
                              </TableCell>
                              <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                                {formatDate(lease.startsOn)}
                                <br />
                                {lease.endsOn ? formatDate(lease.endsOn) : "Month-to-Month"}
                              </TableCell>
                              <TableCell className="px-5 py-4 font-semibold text-parcelis-charcoal">
                                {formatCurrency(lease.monthlyRentCents)}
                              </TableCell>
                              <TableCell className="px-5 py-4">
                                <Badge variant="marker">{formatStatus(lease.status)}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function HeroStatus({ icon: Icon, label, status }: { icon: typeof BadgeCheck; label: string; status?: string | null }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white/70">
        <Icon className={`h-4 w-4 ${getStatusTone(status)}`} />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{formatStatus(status)}</p>
    </div>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: ReactNode;
  icon: typeof BadgeCheck;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-parcelis-gray">{label}</p>
          <Icon className="h-4 w-4 text-parcelis-green" />
        </div>
        <p className="mt-2 truncate text-2xl font-bold text-parcelis-charcoal">{value}</p>
        <div className="mt-1 text-sm text-parcelis-gray">{detail}</div>
      </CardContent>
    </Card>
  );
}

function CollectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-parcelis-gray">{label}</p>
      <p className="mt-1 text-xl font-bold text-parcelis-charcoal">{value}</p>
    </div>
  );
}
