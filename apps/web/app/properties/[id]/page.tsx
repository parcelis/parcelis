"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleDollarSign,
  DoorOpen,
  Loader2,
  Mail,
  Phone,
  Wrench,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, ParcelisLogo } from "@parcelis/ui";
import { propertyTypeValues, type PropertyType, type UpdatePropertyInput } from "@parcelis/schemas";
import { PropertyDrawer, initialPropertyFormState, type PropertyFormState } from "../../../components/property-drawer";
import { apiClient, queryKeys } from "../../../components/api-client";
import { Sidebar } from "../../../components/sidebar";

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

function parseContactAddress(contactAddress: string | null | undefined) {
  const [line1 = "", line2 = "", cityRegionPostal = ""] = contactAddress?.split("\n") ?? [];
  const [city = "", regionPostal = ""] = cityRegionPostal.split(", ");
  const [region = "", ...postalCodeParts] = regionPostal.split(" ");

  return {
    contactAddressLine1: line1,
    contactAddressLine2: line2,
    contactCity: city,
    contactRegion: region,
    contactPostalCode: postalCodeParts.join(" "),
  };
}

function getPropertyType(value: string): PropertyType {
  return propertyTypeValues.includes(value as PropertyType) ? (value as PropertyType) : "Apartment";
}

export default function PropertyDetailPage() {
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const propertyQuery = useQuery({
    queryKey: queryKeys.properties.byId(propertyId),
    queryFn: () => apiClient.properties.byId.query({ id: propertyId }),
  });
  const updateProperty = useMutation({
    mutationFn: (input: UpdatePropertyInput) => apiClient.properties.update.mutate(input),
    onSuccess: async () => {
      setIsEditDrawerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.byId(propertyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.list }),
      ]);
    },
  });
  const [isEditDrawerOpen, setIsEditDrawerOpen] = React.useState(false);
  const [editInitialForm, setEditInitialForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [editForm, setEditForm] = React.useState<PropertyFormState>(initialPropertyFormState);

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
    const endsOn = new Date(lease.endsOn);
    return endsOn >= now && endsOn <= expiresBefore;
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

  function openEditDrawer() {
    if (!property) {
      return;
    }

    const contactAddress = parseContactAddress(property.contactAddress);
    const nextForm: PropertyFormState = {
      name: property.name,
      line1: property.line1,
      line2: property.line2 ?? "",
      city: property.city,
      region: property.region,
      postalCode: property.postalCode,
      propertyType: getPropertyType(property.propertyType),
      contactName: property.contactName ?? "",
      contactEmail: property.contactEmail ?? "",
      contactPhone: property.contactPhone ?? "",
      ...contactAddress,
      unitCount: String(property.unitCount),
    };

    setEditInitialForm(nextForm);
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
        initialFormState={editInitialForm}
        isPending={updateProperty.isPending}
        onFormChange={setEditForm}
        onOpenChange={setIsEditDrawerOpen}
        onSubmit={(input) => updateProperty.mutate({ ...input, id: propertyId })}
        open={isEditDrawerOpen}
        submitLabel="Save"
      />

      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="lg:hidden">
            <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Properties
            </Link>
          </Button>
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
                      {property.line2 ? `, ${property.line2}` : ""}, {property.city}, {property.region} {property.postalCode}
                    </p>
                  </div>
                  <Button onClick={openEditDrawer} variant="secondary">
                    Edit property
                  </Button>
                </div>
              </section>

              <section className="grid gap-5 md:grid-cols-4">
                {[
                  ["Units", String(unitCount), `${occupiedUnits} occupied`, DoorOpen],
                  ["Occupancy", `${occupancyRate}%`, `${sampleVacantUnits} vacant`, Building2],
                  ["Monthly Rent", formatCurrency(monthlyRentCents), `${activeLeases.length} active leases`, CircleDollarSign],
                  ["Tickets", String(openMaintenanceTickets), `${expiringLeases90Days} leases expiring`, Wrench],
                ].map(([label, value, detail, Icon]) => (
                  <Card key={label as string}>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-parcelis-gray">{label as string}</p>
                        {React.createElement(Icon as typeof DoorOpen, { className: "h-4 w-4 text-parcelis-green" })}
                      </div>
                      <p className="mt-2 text-3xl font-bold text-parcelis-charcoal">{value as string}</p>
                      <p className="mt-1 text-sm text-parcelis-gray">{detail as string}</p>
                    </CardContent>
                  </Card>
                ))}
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Units</h2>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: Math.min(unitCount, 8) }, (_, index) => {
                      const unitNumber = index + 1;
                      const lease = leases[index];
                      const isOccupied = unitNumber <= occupiedUnits;
                      return (
                        <div className="rounded-md border border-parcelis-border p-3" key={unitNumber}>
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-parcelis-charcoal">Unit {lease?.unitLabel ?? unitNumber}</p>
                            <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                              {isOccupied ? "Occupied" : "Vacant"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-parcelis-gray">
                            {lease ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : "Ready for assignment"}
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Leases</h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                                {formatDate(lease.startsOn)} to {formatDate(lease.endsOn)}
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

                {contactItems.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <h2 className="font-semibold text-parcelis-charcoal">Property Contact</h2>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {contactItems.map(([label, value]) => (
                        <div
                          className="flex items-start justify-between gap-4 border-b border-parcelis-border pb-3 last:border-0 last:pb-0"
                          key={label}
                        >
                          <span className="text-sm font-medium text-parcelis-gray">{label}</span>
                          <span className="whitespace-pre-line text-right text-sm font-semibold text-parcelis-charcoal">{value}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Maintenance</h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {maintenanceTickets.length === 0 ? (
                      <p className="text-sm text-parcelis-gray">No maintenance tickets are attached to this property yet.</p>
                    ) : (
                      maintenanceTickets.map((ticket) => (
                        <div className="flex items-center gap-3 rounded-md border border-parcelis-border p-3" key={ticket.id}>
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
                        <div className="flex items-center justify-between rounded-md border border-parcelis-border p-3" key={label}>
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
