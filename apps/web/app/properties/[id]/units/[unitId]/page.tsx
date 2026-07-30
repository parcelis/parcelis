"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  DoorOpen,
  FileText,
  Loader2,
  Mail,
  Phone,
  Plus,
  Ruler,
  Settings,
  UserRound,
  Wrench,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ParcelisLogo,
} from "@parcelis/ui";
import type { UpdatePropertyInput } from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../../../components/api-client";
import {
  deletePropertyImage,
  uploadPropertyImage,
} from "../../../../../components/property-image-upload";
import {
  PropertyDrawer,
  initialPropertyFormState,
  type PropertyFormState,
  type UnitDetailsFormState,
} from "../../../../../components/property-drawer";
import {
  getPropertyFormState,
  getUnitFormStates,
} from "../../../../../components/property-drawer-state";
import { Sidebar } from "../../../../../components/sidebar";

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

function getInvoiceRows(startDate: Date | string, amountCents: number) {
  const start = new Date(startDate);

  return Array.from({ length: 3 }, (_, index) => {
    const dueDate = new Date(start.getFullYear(), start.getMonth() + index + 1, 1);

    return {
      id: `INV-${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, "0")}`,
      dueDate,
      amountCents,
    };
  });
}

export default function UnitDetailPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ id: string; unitId: string }>();
  const propertyId = Number(params.id);
  const unitId = Number(params.unitId);
  const propertyQuery = useQuery({
    queryKey: queryKeys.properties.byId(propertyId),
    queryFn: () => apiClient.properties.byId.query({ id: propertyId }),
  });
  const updateProperty = useMutation({
    mutationFn: async ({
      imageFile,
      input,
    }: {
      imageFile: File | null;
      input: UpdatePropertyInput;
    }) => {
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
  const [editInitialForm, setEditInitialForm] =
    React.useState<PropertyFormState>(initialPropertyFormState);
  const [editInitialUnits, setEditInitialUnits] = React.useState<UnitDetailsFormState[]>([]);
  const [editForm, setEditForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [propertyImageFile, setPropertyImageFile] = React.useState<File | null>(null);

  const property = propertyQuery.data;
  const unit = property?.units.find((item) => item.id === unitId) ?? null;
  const lease =
    property?.leases.find(
      (item) =>
        unit &&
        item.unitLabel === unit.name &&
        (item.status === "active" || item.status === "notice"),
    ) ?? null;
  const tenant = lease?.tenant ?? null;
  const unitTickets =
    property?.maintenanceTickets.filter((ticket) => unit && ticket.unitLabel === unit.name) ?? [];
  const openTickets = unitTickets.filter((ticket) => ticket.status !== "resolved");
  const utilities = unit?.utilities.map((item) => item.option.label).filter(Boolean) ?? [];
  const amenities = unit?.amenities.map((item) => item.option.label).filter(Boolean) ?? [];
  const monthlyRentCents = lease?.monthlyRentCents ?? unit?.marketRateCents ?? 0;
  const overdueCents = lease?.amountOverdueCents ?? 0;
  const collectedCents = lease ? Math.max(monthlyRentCents - overdueCents, 0) : 0;
  const collectionRows = [
    ["Collected", formatCurrency(collectedCents), "bg-parcelis-green"],
    ["Outstanding", formatCurrency(overdueCents), "bg-red-500"],
    ["Processing", "—", "bg-orange-500"],
    ["Coming Due", "—", "bg-amber-400"],
    ["Monthly rent", formatCurrency(monthlyRentCents), "bg-parcelis-charcoal"],
  ];
  const invoiceRows = lease ? getInvoiceRows(lease.startsOn, monthlyRentCents) : [];

  function openEditUnitDrawer() {
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
    <main className="min-h-screen">
      <Sidebar active="properties" />
      <PropertyDrawer
        cancelDescription="Are you sure you'd like to cancel editing?"
        drawerTitle="Edit Property"
        error={updateProperty.error}
        form={editForm}
        initialExpandedUnitId={unitId}
        initialFormState={editInitialForm}
        initialStep="unit"
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
        unitHref={(drawerUnit) =>
          drawerUnit.id ? `/properties/${propertyId}/units/${drawerUnit.id}` : null
        }
      />

      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-3 border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href={`/properties/${propertyId}`}>
                <ArrowLeft className="h-4 w-4" />
                Property
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {property ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary">
                    All Units
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-96 min-w-48 overflow-y-auto">
                  <DropdownMenuItem asChild>
                    <Link href={`/properties/${propertyId}`}>All Units</Link>
                  </DropdownMenuItem>
                  {property.units.map((propertyUnit) => (
                    <DropdownMenuItem asChild key={propertyUnit.id}>
                      <Link
                        className={
                          propertyUnit.id === unitId
                            ? "bg-parcelis-porcelain text-parcelis-charcoal"
                            : undefined
                        }
                        href={`/properties/${propertyId}/units/${propertyUnit.id}`}
                      >
                        Unit {propertyUnit.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button disabled size="sm" variant="secondary">
                All Units
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="secondary">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">Archive</span>
            </Button>
            <Button disabled={!property} onClick={openEditUnitDrawer} size="sm" variant="secondary">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Edit Unit</span>
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Note</span>
            </Button>
          </div>
        </header>

        <div className="parcelis-page-shell">
          {propertyQuery.isLoading ? (
            <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm font-medium text-parcelis-gray">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading unit
            </div>
          ) : propertyQuery.error ? (
            <Card>
              <CardContent>
                <p className="text-sm font-medium text-red-700">{propertyQuery.error.message}</p>
              </CardContent>
            </Card>
          ) : !property || !unit ? (
            <Card>
              <CardContent>
                <p className="text-sm text-parcelis-gray">Unit not found.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className="rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-11 w-11 place-items-center rounded-md bg-white/10 text-parcelis-green">
                        <DoorOpen className="h-5 w-5" />
                      </span>
                      <Badge variant="marker">{lease ? "Occupied" : "Vacant"}</Badge>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
                        {formatStatus(unit.unitType)}
                      </span>
                    </div>
                    <h1 className="mt-5 text-3xl font-bold md:text-5xl">Unit {unit.name}</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">
                      {property.name} · {property.line1}
                      {property.line2 ? `, ${property.line2}` : ""}, {property.city},{" "}
                      {property.region} {property.postalCode}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:min-w-80">
                    {[
                      [BedDouble, "Beds", unit.bedrooms ?? 0],
                      [Bath, "Baths", unit.bathrooms ?? 0],
                      [Ruler, "Square feet", unit.squareFeet ?? 0],
                      [CircleDollarSign, "Market rent", formatCurrency(unit.marketRateCents)],
                    ].map(([Icon, label, value]) => (
                      <div className="rounded-md bg-white/10 p-2.5" key={label as string}>
                        {React.createElement(Icon as typeof BedDouble, {
                          className: "h-3.5 w-3.5 text-parcelis-green",
                        })}
                        <p className="mt-1.5 text-[0.6875rem] font-semibold uppercase text-white/55">
                          {label as string}
                        </p>
                        <p className="mt-0.5 text-base font-bold text-white">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Card>
                  <CardHeader className="flex items-center justify-between gap-3 sm:flex-row">
                    <h2 className="font-semibold text-parcelis-charcoal">Lease</h2>
                    <Button size="sm" variant="secondary">
                      <Plus className="h-4 w-4" />
                      New Lease
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {lease ? (
                      <div className="grid gap-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-parcelis-charcoal">
                              Current Lease
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
                        <div className="h-2 rounded-full bg-parcelis-porcelain">
                          <div className="h-2 w-2/3 rounded-full bg-parcelis-green" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-parcelis-gray">
                              Start
                            </p>
                            <p className="mt-1 font-semibold text-parcelis-charcoal">
                              {formatDate(lease.startsOn)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-parcelis-gray">
                              End
                            </p>
                            <p className="mt-1 font-semibold text-parcelis-charcoal">
                              {lease.endsOn ? formatDate(lease.endsOn) : "Month-to-Month"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-parcelis-gray">
                        No active lease is attached to this unit.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Collection</h2>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)] md:items-center">
                      <div className="grid aspect-square place-items-center rounded-full border-[1.35rem] border-parcelis-green bg-white">
                        <div className="text-center">
                          <p className="text-xs font-semibold uppercase text-parcelis-gray">
                            Total
                          </p>
                          <p className="text-xl font-bold text-parcelis-charcoal">
                            {formatCurrency(monthlyRentCents)}
                          </p>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {collectionRows.map(([label, value, color]) => (
                          <div
                            className="flex items-center justify-between gap-4 text-sm"
                            key={label}
                          >
                            <span className="inline-flex items-center gap-2 font-medium text-parcelis-charcoal">
                              <span className={`h-3 w-3 rounded-sm ${color}`} />
                              {label}
                            </span>
                            <span className="font-semibold text-parcelis-charcoal">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Tenant</h2>
                  </CardHeader>
                  <CardContent>
                    {tenant ? (
                      <div className="grid gap-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-12 w-12 place-items-center rounded-md bg-parcelis-porcelain text-sm font-bold text-parcelis-charcoal">
                            {tenant.firstName.charAt(0)}
                            {tenant.lastName.charAt(0)}
                          </span>
                          <div>
                            <p className="font-semibold text-parcelis-charcoal">
                              {tenant.firstName} {tenant.lastName}
                            </p>
                            <p className="text-sm text-parcelis-gray">Primary tenant</p>
                          </div>
                        </div>
                        <div className="grid gap-2 text-sm text-parcelis-gray">
                          <span className="inline-flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {tenant.email}
                          </span>
                          {tenant.phone ? (
                            <span className="inline-flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              {tenant.phone}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-sm text-parcelis-gray">
                        <UserRound className="h-4 w-4" />
                        No tenant is assigned.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex items-center justify-between gap-3 sm:flex-row">
                    <h2 className="font-semibold text-parcelis-charcoal">Upcoming Invoices</h2>
                    <Button size="sm" variant="ghost">
                      View All
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {invoiceRows.length > 0 ? (
                      <div className="overflow-hidden rounded-md border border-parcelis-border">
                        <div className="grid grid-cols-[1fr_1fr_8rem] bg-parcelis-porcelain px-4 py-2 text-xs font-semibold uppercase text-parcelis-gray">
                          <span>Invoice ID</span>
                          <span>Due Date</span>
                          <span className="text-right">Amount Due</span>
                        </div>
                        {invoiceRows.map((invoice) => (
                          <div
                            className="grid grid-cols-[1fr_1fr_8rem] border-t border-parcelis-border px-4 py-3 text-sm"
                            key={invoice.id}
                          >
                            <span className="font-semibold text-parcelis-charcoal">
                              {invoice.id}
                            </span>
                            <span className="text-parcelis-gray">
                              {formatDate(invoice.dueDate)}
                            </span>
                            <span className="text-right font-semibold text-parcelis-charcoal">
                              {formatCurrency(invoice.amountCents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-sm text-parcelis-gray">
                        <FileText className="h-4 w-4" />
                        No upcoming invoices are available.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Unit Details</h2>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {[
                      ["Type", formatStatus(unit.unitType), Building2],
                      ["Bedrooms", String(unit.bedrooms ?? 0), BedDouble],
                      ["Bathrooms", String(unit.bathrooms ?? 0), Bath],
                      ["Square feet", String(unit.squareFeet ?? 0), Ruler],
                    ].map(([label, value, Icon]) => (
                      <div
                        className="flex items-center justify-between rounded-md border border-parcelis-border p-3"
                        key={label as string}
                      >
                        <span className="inline-flex items-center gap-2 text-sm text-parcelis-gray">
                          {React.createElement(Icon as typeof Building2, {
                            className: "h-4 w-4",
                          })}
                          {label as string}
                        </span>
                        <span className="font-semibold text-parcelis-charcoal">
                          {value as string}
                        </span>
                      </div>
                    ))}
                    <div className="grid gap-2 pt-2">
                      {[utilities, amenities].map((items, index) => (
                        <div className="flex flex-wrap gap-2" key={index}>
                          {(items.length > 0 ? items : ["None"]).map((item) => (
                            <span
                              className="rounded-md bg-parcelis-porcelain px-2.5 py-1 text-xs font-semibold text-parcelis-charcoal"
                              key={item}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex items-center justify-between gap-3 sm:flex-row">
                    <h2 className="font-semibold text-parcelis-charcoal">
                      Open Maintenance Requests
                    </h2>
                    <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                      {openTickets.length}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {openTickets.length > 0 ? (
                      openTickets.map((ticket) => (
                        <div
                          className="flex items-center gap-3 rounded-md border border-parcelis-border p-3"
                          key={ticket.id}
                        >
                          <Wrench className="h-4 w-4 text-parcelis-green" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-parcelis-charcoal">
                              {ticket.title}
                            </p>
                            <p className="text-xs text-parcelis-gray">
                              {formatStatus(ticket.status)} · {formatStatus(ticket.priority)}
                              {ticket.dueOn ? ` · Due ${formatDate(ticket.dueOn)}` : ""}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-parcelis-gray">
                        <CalendarClock className="h-4 w-4" />
                        No open maintenance requests.
                      </div>
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
