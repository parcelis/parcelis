"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ChevronRight, Eye, Filter, Plus, Search, Wrench } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateMaintenanceTicketInput } from "@parcelis/schemas";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  ParcelisLogo,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../components/api-client";
import { MaintenanceDrawer } from "../../components/maintenance-drawer";
import { Sidebar } from "../../components/sidebar";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

type MaintenanceFilters = {
  city: string;
  priority: "all" | "urgent";
  propertyId: string;
  propertyStatus: string;
  region: string;
};

const initialFilters: MaintenanceFilters = {
  city: "",
  priority: "all",
  propertyId: "",
  propertyStatus: "all",
  region: "",
};

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="text-2xl font-bold text-white">{value}</div>
      {label}
    </div>
  );
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const [search, setSearch] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [draftFilters, setDraftFilters] = React.useState<MaintenanceFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = React.useState<MaintenanceFilters>(initialFilters);
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [isMaintenanceDrawerOpen, setIsMaintenanceDrawerOpen] = React.useState(false);
  const createMaintenanceMutation = useMutation<unknown, Error, CreateMaintenanceTicketInput>({
    mutationFn: (input) => apiClient.maintenance.create.mutate(input),
    onSuccess: async () => {
      setIsMaintenanceDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
    },
  });
  const properties = propertiesQuery.data ?? [];
  const propertiesWithRequests = properties.filter((property) => property.openMaintenanceTickets > 0);
  const openRequests = properties.reduce((total, property) => total + property.openMaintenanceTickets, 0);
  const urgentRequests = properties.reduce((total, property) => total + property.urgentMaintenanceTickets, 0);
  const urgentProperties = properties.filter((property) => property.urgentMaintenanceTickets > 0).length;
  const normalizedSearch = search.trim().toLowerCase();
  const uniqueCities = Array.from(new Set(properties.map((property) => property.city))).sort();
  const uniqueRegions = Array.from(new Set(properties.map((property) => property.region))).sort();
  const activeFilterCount = Object.values(appliedFilters).filter((value) => value !== "" && value !== "all").length;
  const filteredProperties = propertiesWithRequests.filter((property) =>
    [
      [property.name, property.city, property.region, property.propertyType].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
      !appliedFilters.propertyId || property.id === Number(appliedFilters.propertyId),
      !appliedFilters.city || property.city === appliedFilters.city,
      !appliedFilters.region || property.region === appliedFilters.region,
      appliedFilters.propertyStatus === "all" || property.status === appliedFilters.propertyStatus,
      appliedFilters.priority !== "urgent" || property.urgentMaintenanceTickets > 0,
    ].every(Boolean),
  );

  function updateFilter<Key extends keyof MaintenanceFilters>(key: Key, value: MaintenanceFilters[Key]) {
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

  function togglePropertyTickets(propertyId: number) {
    setExpandedPropertyIds((propertyIds) => {
      const nextPropertyIds = new Set(propertyIds);
      if (nextPropertyIds.has(propertyId)) {
        nextPropertyIds.delete(propertyId);
      } else {
        nextPropertyIds.add(propertyId);
      }
      return nextPropertyIds;
    });
  }

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <Sidebar active="maintenance" />
      <MaintenanceDrawer
        error={createMaintenanceMutation.error}
        isPending={createMaintenanceMutation.isPending}
        onOpenChange={setIsMaintenanceDrawerOpen}
        onSubmit={(input) => createMaintenanceMutation.mutate(input)}
        open={isMaintenanceDrawerOpen}
      />
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
          <Button className="min-w-40" onClick={() => setIsMaintenanceDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            New Maintenance Item
          </Button>
        </header>

        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Maintenance</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Maintenance overview</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Monitor active maintenance requests across the portfolio and prioritize properties that need attention.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-4 md:min-w-[540px]">
              <Metric label="Open Requests" value={openRequests} />
              <Metric label="Urgent" value={urgentRequests} />
              <Metric label="Properties" value={propertiesWithRequests.length} />
              <Metric label="Need Attention" value={urgentProperties} />
            </div>
          </section>

          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold text-parcelis-charcoal">Active maintenance</h2>
                  <p className="mt-1 text-sm text-parcelis-gray">Properties with open maintenance requests.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search property, city, state, type"
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
                  <div className="absolute right-0 top-full z-20 mt-3 w-full max-w-3xl rounded-lg border border-parcelis-border bg-white p-5 shadow-lg">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Label className="gap-2">
                        <span>Property</span>
                        <Select
                          onChange={(event) => updateFilter("propertyId", event.target.value)}
                          value={draftFilters.propertyId}
                        >
                          <option value="">All properties</option>
                          {propertiesWithRequests.map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.name}
                            </option>
                          ))}
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>City</span>
                        <Select
                          onChange={(event) => updateFilter("city", event.target.value)}
                          value={draftFilters.city}
                        >
                          <option value="">All cities</option>
                          {uniqueCities.map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>State</span>
                        <Select
                          onChange={(event) => updateFilter("region", event.target.value)}
                          value={draftFilters.region}
                        >
                          <option value="">All states</option>
                          {uniqueRegions.map((region) => (
                            <option key={region} value={region}>
                              {region}
                            </option>
                          ))}
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>Property Status</span>
                        <Select
                          onChange={(event) => updateFilter("propertyStatus", event.target.value)}
                          value={draftFilters.propertyStatus}
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="leasing">Leasing</option>
                          <option value="archived">Archived</option>
                        </Select>
                      </Label>
                      <Label className="gap-2">
                        <span>Request Priority</span>
                        <Select
                          onChange={(event) =>
                            updateFilter("priority", event.target.value as MaintenanceFilters["priority"])
                          }
                          value={draftFilters.priority}
                        >
                          <option value="all">All priorities</option>
                          <option value="urgent">Urgent only</option>
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
              {propertiesQuery.isLoading ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">Loading maintenance requests…</div>
              ) : propertiesQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">
                  Unable to load maintenance requests. Please try again.
                </div>
              ) : filteredProperties.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {propertiesWithRequests.length === 0
                    ? "No open maintenance requests."
                    : "No properties match your search."}
                </div>
              ) : (
                <Table className="min-w-[860px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-80 px-5 py-3 font-semibold">Property</TableHead>
                      <TableHead className="w-56 px-5 py-3 font-semibold">Issue Date</TableHead>
                      <TableHead className="w-40 px-5 py-3 font-semibold">Open Requests</TableHead>
                      <TableHead className="w-32 px-5 py-3 font-semibold">Urgent</TableHead>
                      <TableHead className="w-32 px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="w-28 px-5 py-3 text-right font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.map((property) => {
                      const openTickets = property.maintenanceTickets.filter((ticket) => ticket.status !== "resolved");
                      const isExpanded = expandedPropertyIds.has(property.id);

                      return (
                        <React.Fragment key={property.id}>
                          <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <TableCell className="px-5 py-4">
                              <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3">
                                <button
                                  aria-label={
                                    isExpanded
                                      ? `Collapse ${property.name} requests`
                                      : `Expand ${property.name} requests`
                                  }
                                  className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-white"
                                  onClick={() => togglePropertyTickets(property.id)}
                                  type="button"
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </button>
                                <Link className="flex items-center gap-3" href={`/properties/${property.id}`}>
                                  <div className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-parcelis-charcoal hover:text-parcelis-green">
                                      {property.name}
                                    </p>
                                    <p className="text-sm text-parcelis-gray">{property.propertyType}</p>
                                  </div>
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4">
                              <span className="inline-flex items-center gap-2 font-semibold text-parcelis-charcoal">
                                <Wrench className="h-4 w-4 text-parcelis-green" />
                                {property.openMaintenanceTickets}
                              </span>
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              {property.urgentMaintenanceTickets > 0 ? (
                                <span className="inline-flex items-center gap-2 font-semibold text-red-700">
                                  <AlertTriangle className="h-4 w-4" />
                                  {property.urgentMaintenanceTickets}
                                </span>
                              ) : (
                                <span className="text-parcelis-gray">None</span>
                              )}
                            </TableCell>
                            <TableCell className="px-5 py-4">
                              <span className="rounded-md bg-parcelis-porcelain px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                                {formatStatus(property.status)}
                              </span>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right">
                              <Button asChild size="sm" variant="secondary">
                                <Link href={`/properties/${property.id}`}>
                                  <Eye className="h-4 w-4" />
                                  View
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded
                            ? openTickets.map((ticket) => (
                                <TableRow
                                  className="border-t border-parcelis-border bg-parcelis-porcelain/45"
                                  key={ticket.id}
                                >
                                  <TableCell className="px-5 py-3">
                                    <div className="grid grid-cols-[2rem_2.25rem_minmax(0,1fr)] items-center gap-3">
                                      <span aria-hidden="true" />
                                      <div className="grid h-8 w-8 place-items-center rounded-md bg-white text-parcelis-green">
                                        <Wrench className="h-4 w-4" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="truncate font-semibold text-parcelis-charcoal">{ticket.title}</p>
                                        <p className="text-xs text-parcelis-gray">
                                          {ticket.unitLabel ? `Unit ${ticket.unitLabel}` : "Property-wide request"}
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                    {formatDate(ticket.openedOn)}
                                  </TableCell>
                                  <TableCell className="px-5 py-3">
                                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-parcelis-charcoal">
                                      {formatStatus(ticket.status)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-5 py-3">
                                    <span
                                      className={
                                        ticket.priority === "urgent"
                                          ? "font-semibold text-red-700"
                                          : "text-parcelis-gray"
                                      }
                                    >
                                      {formatStatus(ticket.priority)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                    {ticket.dueOn ? `Due ${formatDate(ticket.dueOn)}` : "No due date"}
                                  </TableCell>
                                  <TableCell />
                                </TableRow>
                              ))
                            : null}
                        </React.Fragment>
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
