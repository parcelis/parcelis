"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CircleDollarSign,
  DoorOpen,
  Loader2,
  Mail,
  PenLine,
  Phone,
  Ruler,
  Wrench,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  DialogContent,
  ParcelisLogo,
  Select,
} from "@parcelis/ui";
import type { UpdatePropertyInput } from "@parcelis/schemas";
import {
  PropertyDrawer,
  initialPropertyFormState,
  type PropertyFormState,
  type UnitDetailsFormState,
} from "../../../components/property-drawer";
import { getPropertyFormState, getUnitFormStates } from "../../../components/property-drawer-state";
import { apiClient, queryKeys } from "../../../components/api-client";
import { deletePropertyImage, uploadPropertyImage } from "../../../components/property-image-upload";
import { NotesDrawer } from "../../../components/notes-drawer";
import { EntityLifecycleControls } from "../../../components/entity-lifecycle-controls";
import { Sidebar } from "../../../components/sidebar";
import { StickyNotePlusIcon } from "../../../components/sticky-note-plus-icon";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export default function PropertyDetailPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const propertyId = Number(params.id);
  const propertyQuery = useQuery({
    queryKey: queryKeys.properties.byId(propertyId),
    queryFn: () => apiClient.properties.byId.query({ id: propertyId }),
  });
  const updateProperty = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: UpdatePropertyInput }) => {
      const updatedProperty = await apiClient.properties.update.mutate(input);
      if (imageFile) await uploadPropertyImage(updatedProperty.id, imageFile);
      return updatedProperty;
    },
    onSuccess: async () => {
      setIsEditDrawerOpen(false);
      setEditInitialUnits([]);
      setPropertyImageFile(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.properties.byId(propertyId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
      ]);
    },
  });
  const deletePropertyImageMutation = useMutation({
    mutationFn: deletePropertyImage,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.properties.byId(propertyId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
      ]);
    },
  });
  const [isEditDrawerOpen, setIsEditDrawerOpen] = React.useState(false);
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = React.useState(false);
  const [editInitialForm, setEditInitialForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [editInitialUnits, setEditInitialUnits] = React.useState<UnitDetailsFormState[]>([]);
  const [editForm, setEditForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [propertyImageFile, setPropertyImageFile] = React.useState<File | null>(null);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = React.useState(false);
  const [unitStatusFilter, setUnitStatusFilter] = React.useState("all");

  const property = propertyQuery.data;
  const leases = property?.leases ?? [];
  const maintenanceTickets = property?.maintenanceTickets ?? [];
  const activeLeases = leases.filter((lease) => lease.status === "active" || lease.status === "notice");
  const occupiedUnits = property?.occupiedUnits ?? 0;
  const unitCount = property?.unitCount ?? 0;
  const occupancyRate = unitCount > 0 ? Math.round((occupiedUnits / unitCount) * 100) : 0;
  const monthlyRentCents = activeLeases.reduce((sum, lease) => sum + lease.monthlyRentCents, 0);
  const amountOverdueCents = activeLeases.reduce((sum, lease) => sum + lease.amountOverdueCents, 0);
  const expiringLeases90Days = activeLeases.filter((lease) => {
    const now = new Date();
    const expiresBefore = new Date(now);
    expiresBefore.setDate(expiresBefore.getDate() + 90);
    return lease.endsOn !== null && new Date(lease.endsOn) >= now && new Date(lease.endsOn) <= expiresBefore;
  }).length;
  const openMaintenanceTickets = maintenanceTickets.filter((ticket) => ticket.status !== "resolved").length;
  const sampleVacantUnits = Math.max(unitCount - occupiedUnits, 0);
  const contactItems = property
    ? [
        ["Contact Name", property.contactName],
        ["Contact Email", property.contactEmail],
        ["Contact Phone", property.contactPhone],
        ["Contact Address", property.contactAddress],
      ].filter(([, value]) => Boolean(value))
    : [];
  const unitCards = property
    ? (property.units.length > 0
        ? property.units
        : Array.from({ length: unitCount }, (_, index) => ({
            id: String(index + 1),
            name: String(index + 1),
            bedrooms: null,
            bathrooms: null,
            squareFeet: null,
            marketRateCents: 0,
          }))
      ).map((unit, index) => {
        const lease = leases.find((item) => item.unitLabel === unit.name) ?? leases[index];

        return {
          unit,
          lease,
          status: lease?.status ?? "vacant",
          href: property.units.some((savedUnit) => savedUnit.id === unit.id)
            ? `/properties/${property.id}/units/${unit.id}`
            : null,
        };
      })
    : [];
  const filteredUnitCards = unitCards.filter(({ status }) => unitStatusFilter === "all" || status === unitStatusFilter);

  function openEditDrawer() {
    if (!property) {
      return;
    }

    const nextForm = getPropertyFormState(property);

    setEditInitialForm(nextForm);
    setEditInitialUnits(getUnitFormStates(property));
    setEditForm(nextForm);
    setIsEditDrawerOpen(true);
  }

  return (
    <main className="flex-1">
      <Sidebar active="properties" />
      <PropertyDrawer
        cancelDescription="Are you sure you'd like to cancel editing?"
        drawerTitle="Edit Property"
        error={updateProperty.error}
        form={editForm}
        initialFormState={editInitialForm}
        initialUnits={editInitialUnits}
        imageFile={propertyImageFile}
        imageUrl={property?.imageUrl}
        isImageDeletePending={deletePropertyImageMutation.isPending}
        isPending={updateProperty.isPending}
        onFormChange={setEditForm}
        onImageChange={setPropertyImageFile}
        onImageDelete={() => deletePropertyImageMutation.mutate(propertyId)}
        onOpenChange={setIsEditDrawerOpen}
        onSubmit={(input, imageFile) =>
          updateProperty.mutate({
            imageFile,
            input: { ...input, id: propertyId },
          })
        }
        open={isEditDrawerOpen}
        submitLabel="Save"
        unitHref={(unit) => (unit.id ? `/properties/${propertyId}/units/${unit.id}` : null)}
      />
      <NotesDrawer
        onOpenChange={setIsNotesDrawerOpen}
        open={isNotesDrawerOpen}
        propertySummary={
          property
            ? {
                name: property.name,
                addressLines: [
                  property.line1,
                  ...(property.line2 ? [property.line2] : []),
                  `${property.city}, ${property.region} ${property.postalCode}`,
                ],
                unitCount: property.unitCount,
              }
            : undefined
        }
        subject={{ propertyId }}
        subjectLabel={property?.name ?? "Property"}
      />
      {property?.imageUrl ? (
        <Dialog onOpenChange={setIsImagePreviewOpen} open={isImagePreviewOpen}>
          <DialogContent
            aria-label={`${property.name} property image`}
            className="w-fit max-w-[90vw] place-items-center border-0 bg-transparent p-0 shadow-none [&>button]:right-3 [&>button]:top-3 [&>button]:grid [&>button]:h-8 [&>button]:w-8 [&>button]:place-items-center [&>button]:rounded-md [&>button]:border [&>button]:border-parcelis-border [&>button]:bg-white [&>button]:p-0 [&>button]:!text-slate-900 [&>button]:opacity-100 [&>button:hover]:bg-parcelis-porcelain [&>button:hover]:!text-slate-950"
          >
            <img
              alt={`${property.name} property`}
              className="max-h-[85vh] max-w-[90vw] rounded-md object-contain"
              src={property.imageUrl}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-10 sm:min-w-40" variant="secondary">
              <Link href="/properties">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Properties</span>
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <EntityLifecycleControls
              archiveDescription={
                <>This will hide {property?.name ?? "this property"} from the default properties view.</>
              }
              cancelDeleteLabel="Keep Property"
              deleteDescription={
                <>This permanently deletes {property?.name ?? "this property"} and cannot be undone.</>
              }
              entityLabel="property"
              isArchived={property?.status === "archived"}
              isAvailable={Boolean(property)}
              onArchive={() => apiClient.properties.archive.mutate({ id: propertyId })}
              onArchiveSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(propertyId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
                ]);
                router.push("/properties");
              }}
              onDelete={() => apiClient.properties.delete.mutate({ id: propertyId })}
              onDeleteSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(propertyId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
                ]);
                router.push("/properties");
              }}
              onReactivate={() => apiClient.properties.reactivate.mutate({ id: propertyId })}
              onReactivateSuccess={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(propertyId) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
                ]);
              }}
            />
            <Button
              aria-label="Add notes"
              className="min-w-10 sm:min-w-40"
              disabled={!property}
              onClick={() => setIsNotesDrawerOpen(true)}
              variant="secondary"
            >
              <StickyNotePlusIcon />
              <span className="hidden sm:inline">Add Notes</span>
            </Button>
            <Button
              aria-label="Edit property"
              className="min-w-10 sm:min-w-40"
              disabled={!property}
              onClick={openEditDrawer}
            >
              <PenLine className="h-4 w-4" />
              <span className="hidden sm:inline">Edit property</span>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          {propertyQuery.isLoading ? (
            <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm font-medium text-parcelis-gray">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading property
            </div>
          ) : propertyQuery.error ? (
            <Card>
              <CardContent>
                <p className="text-sm font-medium text-red-700">{propertyQuery.error.message}</p>
              </CardContent>
            </Card>
          ) : !property ? (
            <Card>
              <CardContent>
                <p className="text-sm text-parcelis-gray">Property not found.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-md bg-white/10 text-parcelis-green">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-parcelis-green">
                        {formatStatus(property.status)}
                      </span>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
                        {property.propertyType}
                      </span>
                    </div>
                    <h1 className="mt-5 text-3xl font-bold md:text-5xl">{property.name}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                      {property.line1}
                      {property.line2 ? `, ${property.line2}` : ""}, {property.city}, {property.region}{" "}
                      {property.postalCode}
                    </p>
                    {contactItems.length > 0 ? (
                      <div className="mt-5 flex max-w-4xl flex-wrap gap-2">
                        {contactItems.map(([label, value]) => (
                          <div
                            className="inline-flex max-w-full items-start gap-2 rounded-md bg-white/10 px-2.5 py-2 text-sm"
                            key={label}
                          >
                            <Badge variant="marker">{label}</Badge>
                            <span className="whitespace-pre-line break-words font-semibold text-white">{value}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {property.imageUrl ? (
                    <div className="flex w-full flex-col gap-4 md:w-52 md:self-stretch md:items-end">
                      <div className="flex flex-1 items-center md:w-full md:justify-end">
                        <button
                          aria-label={`View ${property.name} property image`}
                          className="h-32 w-full overflow-hidden rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green"
                          onClick={() => setIsImagePreviewOpen(true)}
                          type="button"
                        >
                          <img
                            alt={`${property.name} property`}
                            className="h-full w-full object-cover transition duration-200 hover:scale-[1.02]"
                            src={property.imageUrl}
                          />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="grid gap-5 md:grid-cols-4">
                {[
                  ["Units", String(unitCount), `${occupiedUnits} occupied`, DoorOpen],
                  ["Occupancy", `${occupancyRate}%`, `${sampleVacantUnits} vacant`, Building2],
                  [
                    "Monthly Rent",
                    formatCurrency(monthlyRentCents),
                    `${activeLeases.length} active leases`,
                    CircleDollarSign,
                  ],
                  ["Tickets", String(openMaintenanceTickets), `${expiringLeases90Days} leases expiring`, Wrench],
                ].map(([label, value, detail, Icon]) => (
                  <Card key={label as string}>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-parcelis-gray">{label as string}</p>
                        {React.createElement(Icon as typeof DoorOpen, {
                          className: "h-4 w-4 text-parcelis-green",
                        })}
                      </div>
                      <p className="mt-2 text-3xl font-bold text-parcelis-charcoal">{value as string}</p>
                      <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                        <p className="text-parcelis-gray">{detail as string}</p>
                        {label === "Monthly Rent" ? (
                          <p className="whitespace-nowrap font-semibold text-red-700">
                            {formatCurrency(amountOverdueCents)} overdue
                          </p>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <Card>
                  <CardHeader className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold text-parcelis-charcoal">Units</h2>
                    <Select
                      aria-label="Filter units by status"
                      className="w-36"
                      onChange={(event) => setUnitStatusFilter(event.target.value)}
                      value={unitStatusFilter}
                    >
                      <option value="all">All statuses</option>
                      {property.unitStatuses.map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </Select>
                  </CardHeader>
                  <CardContent className="grid max-h-[34rem] gap-3 overflow-y-auto pr-3 sm:grid-cols-2">
                    {filteredUnitCards.map(({ href, lease, status, unit }) => {
                      return (
                        <Link
                          className="block rounded-md border border-parcelis-border p-3 transition hover:border-parcelis-green hover:bg-parcelis-porcelain/55"
                          href={href ?? `/properties/${property.id}`}
                          key={unit.id}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-parcelis-charcoal">Unit {unit.name}</p>
                            <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                              {formatStatus(status)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-parcelis-gray">
                            {lease
                              ? `${lease.tenant.firstName} ${lease.tenant.lastName}`
                              : formatCurrency(unit.marketRateCents)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-parcelis-gray">
                            <span className="inline-flex items-center gap-1">
                              <BedDouble className="h-3.5 w-3.5" />
                              {unit.bedrooms ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Bath className="h-3.5 w-3.5" />
                              {unit.bathrooms ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Ruler className="h-3.5 w-3.5" />
                              {unit.squareFeet ?? 0} sf
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                    {filteredUnitCards.length === 0 ? (
                      <p className="text-sm text-parcelis-gray sm:col-span-2">No units match this status.</p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Active</h2>
                  </CardHeader>
                  <CardContent className="max-h-[34rem] space-y-3 overflow-y-auto pr-3">
                    {leases.length === 0 ? (
                      <p className="text-sm text-parcelis-gray">No leases are attached to this property yet.</p>
                    ) : (
                      leases.map((lease) => (
                        <div className="rounded-md border border-parcelis-border p-3" key={lease.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-parcelis-charcoal">
                                Unit {lease.unitLabel} · {lease.tenant.firstName} {lease.tenant.lastName}
                              </p>
                              <p className="mt-1 text-sm text-parcelis-gray">
                                {formatDate(lease.startsOn)} to{" "}
                                {lease.endsOn ? formatDate(lease.endsOn) : "Month-to-Month"}
                              </p>
                            </div>
                            <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                              {formatStatus(lease.status)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-sm text-parcelis-gray">
                            <span className="inline-flex items-center gap-1">
                              <CircleDollarSign className="h-4 w-4" />
                              {formatCurrency(lease.monthlyRentCents)}
                            </span>
                            {lease.amountOverdueCents > 0 ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                Overdue {formatCurrency(lease.amountOverdueCents)}
                              </span>
                            ) : null}
                            {lease.tenant.email ? (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-4 w-4" />
                                {lease.tenant.email}
                              </span>
                            ) : null}
                            {lease.tenant.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-4 w-4" />
                                {lease.tenant.phone}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Maintenance</h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {maintenanceTickets.length === 0 ? (
                      <p className="text-sm text-parcelis-gray">
                        No maintenance tickets are attached to this property yet.
                      </p>
                    ) : (
                      maintenanceTickets.map((ticket) => (
                        <div
                          className="flex items-center gap-3 rounded-md border border-parcelis-border p-3"
                          key={ticket.id}
                        >
                          <Wrench className="h-4 w-4 text-parcelis-green" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-parcelis-charcoal">{ticket.title}</p>
                            <p className="text-xs text-parcelis-gray">
                              {formatStatus(ticket.status)} · {formatStatus(ticket.priority)}
                              {ticket.dueOn ? ` · Due ${formatDate(ticket.dueOn)}` : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Financials</h2>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {[
                        ["Gross scheduled rent", formatCurrency(monthlyRentCents)],
                        ["Overdue balance", formatCurrency(amountOverdueCents)],
                        ["Leases expiring in 90 days", String(expiringLeases90Days)],
                        ["Estimated vacancy loss", formatCurrency(Math.max(unitCount - occupiedUnits, 0) * 175000)],
                        ["Owner distribution", formatCurrency(Math.max(monthlyRentCents - 126000, 0))],
                      ].map(([label, value]) => (
                        <div
                          className="flex items-center justify-between rounded-md border border-parcelis-border p-3"
                          key={label}
                        >
                          <span className="text-sm text-parcelis-gray">{label}</span>
                          <span className="font-semibold text-parcelis-charcoal">{value}</span>
                        </div>
                      ))}
                    </div>
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
