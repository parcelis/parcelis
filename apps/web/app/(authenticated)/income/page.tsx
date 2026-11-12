"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, DoorOpen, Filter, Plus, Search } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
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
import {
  getBillingCalendarDate,
  getInvoiceCalendarDate,
  getReceivableStatus,
  summarizeInvoiceBalances,
  formatInvoiceNumber,
} from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../components/api-client";
import { hasPermission } from "../../../components/property-access";
import { LoadingState } from "../../../components/loading-state";
import { InvoiceDrawer } from "../../../components/invoice-drawer";
import { PageRail } from "../../../components/page-rail";
import { getInvoiceLink } from "../../../lib/entity-links";

function formatCurrency(cents: number | null) {
  if (cents === null) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatLeaseStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}

function isUpcomingInvoice(invoice: { balanceCents: number; dueOn: Date | string; status: string }, today: string) {
  return invoice.status !== "void" && invoice.balanceCents > 0 && getInvoiceCalendarDate(invoice.dueOn) > today;
}

function getIncomeInvoiceStatus(
  invoice: { amountCents: number; balanceCents: number; dueOn: Date | string; status: string },
  today: string,
) {
  if (isUpcomingInvoice(invoice, today)) return "Upcoming";
  const status = getReceivableStatus(invoice, today);
  if (status === "void") return "Void";
  if (status === "paid") return "Fully paid";
  return `${status === "overdue" ? "Overdue" : "Due today"}${invoice.balanceCents < invoice.amountCents ? " · Partially paid" : ""}`;
}

function getTenantName(lease: {
  tenant: { firstName: string; lastName: string } | null;
  tenants?: Array<{ firstName: string; lastName: string }>;
}) {
  const tenants = lease.tenants?.length ? lease.tenants : lease.tenant ? [lease.tenant] : [];
  return tenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`).join(", ") || "Unavailable";
}

function parseEntityId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getLeaseInvoices<T>(lease: { invoices?: T[] }) {
  return lease.invoices ?? [];
}

export default function IncomePage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading income..." />}>
      <IncomePageContent />
    </React.Suspense>
  );
}

function IncomePageContent() {
  const [expandedUnitIds, setExpandedUnitIds] = React.useState<Set<string>>(new Set());
  const [groupByUnit, setGroupByUnit] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [isInvoiceDrawerOpen, setIsInvoiceDrawerOpen] = React.useState(false);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [draftPropertyId, setDraftPropertyId] = React.useState("all");
  const [draftUnitId, setDraftUnitId] = React.useState("all");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const tenantId = Number(searchParams.get("tenantId"));
  const selectedTenantId = Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null;
  const selectedPropertyId = parseEntityId(searchParams.get("propertyId"));
  const selectedUnitId = parseEntityId(searchParams.get("unitId"));
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });
  const canViewInvoices = hasPermission(currentUserQuery.data?.permissions, "invoices", "view");
  const canViewLeases = hasPermission(currentUserQuery.data?.permissions, "leases", "view");
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
    enabled: canViewInvoices && canViewLeases,
  });
  const chargesQuery = useQuery({
    queryKey: queryKeys.invoices.charges,
    queryFn: () => apiClient.invoices.charges.query(),
    enabled: canViewInvoices,
  });
  const organizationQuery = useQuery({
    queryKey: queryKeys.organizations.active,
    queryFn: () => apiClient.organizations.active.query(),
  });
  const today = organizationQuery.data?.timeZone ? getBillingCalendarDate(organizationQuery.data.timeZone) : null;
  const tenantInvoicesQuery = useQuery({
    queryKey: ["invoices", "list", { tenantId: selectedTenantId }],
    queryFn: () => apiClient.invoices.list.query({ tenantId: selectedTenantId! }),
    enabled: canViewInvoices && selectedTenantId !== null,
  });
  const tenantInvoiceIds = new Set(tenantInvoicesQuery.data?.map((invoice) => invoice.id));
  const properties = (propertiesQuery.data ?? []).map((property) => ({
    ...property,
    leases: property.leaseHistory.map((lease) => ({
      ...lease,
      invoices: lease.invoices.filter((invoice) => selectedTenantId === null || tenantInvoiceIds.has(invoice.id)),
    })),
  }));
  const createInvoice = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.invoices.createManual.mutate>[0]) =>
      apiClient.invoices.createManual.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
      setIsInvoiceDrawerOpen(false);
    },
  });
  const isEligibleIncomeLease = (lease: (typeof properties)[number]["leases"][number]) =>
    lease.status !== "draft" &&
    (selectedTenantId === null || lease.tenants.some((tenant) => tenant.id === selectedTenantId));
  const isSummaryLease = (lease: (typeof properties)[number]["leases"][number]) =>
    (lease.status === "active" || lease.status === "notice") &&
    (selectedTenantId === null || lease.tenants.some((tenant) => tenant.id === selectedTenantId));
  const selectedTenant =
    selectedTenantId === null
      ? null
      : properties
          .flatMap((property) => property.leases.flatMap((lease) => lease.tenants))
          .find((tenant) => tenant.id === selectedTenantId);
  const unitFilterOptions = properties
    .filter((property) => draftPropertyId === "all" || property.id === parseEntityId(draftPropertyId))
    .map((property) => {
      const eligibleUnitIds = new Set(property.leases.filter(isEligibleIncomeLease).map((lease) => lease.unitId));
      return { ...property, units: property.units.filter((unit) => eligibleUnitIds.has(unit.id)) };
    })
    .filter((property) => property.units.length > 0);
  const isDraftPropertyAvailable =
    draftPropertyId === "all" || properties.some((property) => property.id === parseEntityId(draftPropertyId));
  const isDraftUnitAvailable =
    draftUnitId === "all" ||
    unitFilterOptions.some((property) => property.units.some((unit) => unit.id === parseEntityId(draftUnitId)));
  const incomeProperties = properties
    .filter((property) => selectedPropertyId === null || property.id === selectedPropertyId)
    .map((property) => {
      const incomeLeases = property.leases.filter(
        (lease) => isEligibleIncomeLease(lease) && (selectedUnitId === null || lease.unitId === selectedUnitId),
      );
      const summaryLeases = incomeLeases.filter(isSummaryLease);
      return {
        ...property,
        incomeLeases,
        monthlyRentCents: summaryLeases.reduce((total, lease) => total + (lease.monthlyRentCents ?? 0), 0),
      };
    })
    .filter((property) => property.incomeLeases.length > 0);
  const scheduledIncomeCents = incomeProperties.reduce((total, property) => total + property.monthlyRentCents, 0);
  const balances = summarizeInvoiceBalances(
    incomeProperties.flatMap((property) => property.incomeLeases.flatMap((lease) => lease.invoices)),
    today ?? "",
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredIncomeProperties = incomeProperties
    .map((property) => ({
      ...property,
      incomeLeases: property.incomeLeases.filter((lease) =>
        [property.name, lease.unitLabel, getTenantName(lease), formatLeaseStatus(lease.status)].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        ),
      ),
    }))
    .filter((property) => property.incomeLeases.length > 0);
  const incomeLeases = filteredIncomeProperties.flatMap((property) =>
    property.incomeLeases.map((lease) => ({ property, lease })),
  );
  const unitGroups = new Map<
    string,
    {
      id: string;
      property: (typeof incomeProperties)[number];
      unitLabel: string;
      incomeLeases: Array<(typeof incomeLeases)[number]["lease"]>;
    }
  >();
  for (const { property, lease } of incomeLeases) {
    const id = `${property.id}:${lease.unitId}`;
    const group = unitGroups.get(id) ?? {
      id,
      property,
      unitLabel: lease.unitLabel,
      incomeLeases: [],
    };
    group.incomeLeases.push(lease);
    unitGroups.set(id, group);
  }
  const filteredUnitGroups = Array.from(unitGroups.values());
  const ungroupedIncomeRows = incomeLeases.flatMap(({ property, lease }) => {
    const persistedInvoices = getLeaseInvoices(lease);
    return persistedInvoices
      .filter((invoice) => invoice.status !== "void")
      .map((invoice) => ({
        property,
        lease,
        invoice,
      }));
  });

  function setIncomeFilters(propertyId: number | null, unitId: number | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (propertyId === null) params.delete("propertyId");
    else params.set("propertyId", String(propertyId));
    if (unitId === null) params.delete("unitId");
    else params.set("unitId", String(unitId));
    const query = params.toString();
    router.replace(query ? `/income?${query}` : "/income", { scroll: false });
    setIsFilterOpen(false);
  }

  // Toggle the expanded state of a unit in the income dashboard.
  function toggleUnit(unitId: string) {
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      // If the unit is already expanded, collapse it; otherwise, expand it.
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  if (currentUserQuery.isPending) return <LoadingState label="Loading income..." />;
  if (currentUserQuery.isError) {
    return (
      <main className="p-6 lg:pl-[var(--parcelis-sidebar-width)]">
        <div role="alert" className="space-y-3 p-6 text-sm text-red-700">
          <p>{currentUserQuery.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => void currentUserQuery.refetch()}
            disabled={currentUserQuery.isFetching}
          >
            Retry
          </Button>
        </div>
      </main>
    );
  }
  if (!canViewInvoices || !canViewLeases) {
    return (
      <main className="p-6 lg:pl-[var(--parcelis-sidebar-width)]">
        <p className="p-6 text-parcelis-gray">
          {!canViewInvoices
            ? "You do not have permission to view invoices."
            : "Unavailable: you do not have permission to view leases."}
        </p>
      </main>
    );
  }

  if (
    organizationQuery.isPending ||
    propertiesQuery.isPending ||
    (selectedTenantId !== null && tenantInvoicesQuery.isPending)
  )
    return <LoadingState label="Loading income..." />;
  if (
    organizationQuery.isError ||
    propertiesQuery.isError ||
    (selectedTenantId !== null && tenantInvoicesQuery.isError) ||
    !today
  ) {
    return (
      <main className="p-6 lg:pl-[var(--parcelis-sidebar-width)]">
        <p role="alert">Unable to load income. Refresh to retry.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8 dark:bg-parcelis-slate/90">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
          <Button className="min-w-40" onClick={() => setIsInvoiceDrawerOpen(true)} type="button">
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        </header>
        <div className="parcelis-page-shell">
          <PageRail
            description="Monitor scheduled rent and overdue balances across your portfolio."
            eyebrow="Income"
            title="Income dashboard"
          >
            <div className="flex flex-wrap gap-2 text-sm text-white/75 md:min-w-[420px]">
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(scheduledIncomeCents)}</div>
                Scheduled monthly rent
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(balances.recordedPaymentCents)}</div>
                Net payments recorded (all dates)
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(balances.overdueCents)}</div>
                Overdue balance
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(balances.dueTodayCents)}</div>
                Due today
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(balances.futureCents)}</div>
                Future scheduled balance
              </div>
            </div>
          </PageRail>

          {selectedTenantId !== null ? (
            <p className="mb-4 rounded-md border border-parcelis-border bg-white p-4 text-sm text-parcelis-gray dark:bg-parcelis-slate">
              Tenant filter:{" "}
              {selectedTenant
                ? `${selectedTenant.firstName} ${selectedTenant.lastName}`
                : `Tenant #${selectedTenantId}`}
              . Property and unit filters apply within this tenant’s income. Clearing filters keeps this tenant
              restriction.
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-parcelis-charcoal">
                    {groupByUnit ? "Income by unit" : "Income rent roll"}
                  </h2>
                  <p className="mt-1 text-sm text-parcelis-gray">
                    {groupByUnit
                      ? "Scheduled, active, notice-period, and historical leases, grouped by unit."
                      : "Scheduled, active, notice-period, and historical leases listed by property and unit."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray sm:min-w-72">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search property, unit, status"
                      value={search}
                    />
                  </label>
                  <Button
                    onClick={() => {
                      setDraftPropertyId(selectedPropertyId === null ? "all" : String(selectedPropertyId));
                      setDraftUnitId(selectedUnitId === null ? "all" : String(selectedUnitId));
                      setIsFilterOpen((isOpen) => !isOpen);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                    {selectedPropertyId !== null || selectedUnitId !== null
                      ? ` (${Number(selectedPropertyId !== null) + Number(selectedUnitId !== null)})`
                      : ""}
                  </Button>
                  <Button onClick={() => setGroupByUnit((grouped) => !grouped)} type="button" variant="secondary">
                    {groupByUnit ? "Grouped By Unit" : " Not Grouped"}
                  </Button>
                </div>
                {isFilterOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-3 w-full max-w-sm rounded-lg border border-parcelis-border bg-white p-5 shadow-lg">
                    <Label className="gap-2">
                      <span>Property</span>
                      <Select
                        onChange={(event) => {
                          const propertyId = event.target.value;
                          const property = properties.find((item) => item.id === parseEntityId(propertyId));
                          setDraftPropertyId(propertyId);
                          if (
                            propertyId !== "all" &&
                            !property?.units.some((unit) => unit.id === parseEntityId(draftUnitId))
                          ) {
                            setDraftUnitId("all");
                          }
                        }}
                        value={draftPropertyId}
                      >
                        <option value="all">All properties</option>
                        {!isDraftPropertyAvailable ? (
                          <option value={draftPropertyId}>Unavailable property</option>
                        ) : null}
                        {properties.map((property) => (
                          <option key={property.id} value={String(property.id)}>
                            {property.name}
                          </option>
                        ))}
                      </Select>
                    </Label>
                    <Label className="mt-4 gap-2">
                      <span>Unit</span>
                      <Select onChange={(event) => setDraftUnitId(event.target.value)} value={draftUnitId}>
                        <option value="all">All units</option>
                        {!isDraftUnitAvailable ? <option value={draftUnitId}>Unavailable unit</option> : null}
                        {unitFilterOptions.map((property) => (
                          <optgroup key={property.id} label={property.name}>
                            {property.units.map((unit) => (
                              <option key={unit.id} value={String(unit.id)}>
                                Unit {unit.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </Select>
                    </Label>
                    <div className="mt-5 flex items-center justify-between border-t border-parcelis-border pt-4">
                      <button
                        className="text-sm font-semibold text-red-600 hover:underline"
                        onClick={() => setIncomeFilters(null, null)}
                        type="button"
                      >
                        Clear Filters
                      </button>
                      <Button
                        onClick={() => setIncomeFilters(parseEntityId(draftPropertyId), parseEntityId(draftUnitId))}
                        type="button"
                      >
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {filteredIncomeProperties.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {incomeProperties.length > 0
                    ? "No income records match your search."
                    : selectedPropertyId !== null && selectedUnitId !== null
                      ? "No income leases match the selected property and unit."
                      : selectedUnitId !== null
                        ? "No income leases for the selected unit."
                        : selectedPropertyId !== null
                          ? "No scheduled, active, notice-period, or historical income leases for the selected property."
                          : "No income leases are available to report income yet."}
                </div>
              ) : groupByUnit ? (
                <Table className="min-w-[1360px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[28%] px-5 py-3 font-semibold">Unit / Property</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Unit</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Due on</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Paid on</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Invoice ID</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Amount</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Processing</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Paid</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnitGroups.map((group) => {
                      const isExpanded = expandedUnitIds.has(group.id);
                      const invoiceRows: Array<{ amountCents: number; balanceCents: number }> = [];
                      for (const lease of group.incomeLeases) {
                        const persistedInvoices = getLeaseInvoices(lease);
                        if (persistedInvoices.length > 0)
                          invoiceRows.push(...persistedInvoices.filter((invoice) => invoice.status !== "void"));
                      }
                      const amountCents = invoiceRows.reduce((total, invoice) => total + invoice.amountCents, 0);
                      const paidCents = invoiceRows.reduce(
                        (total, invoice) => total + invoice.amountCents - invoice.balanceCents,
                        0,
                      );
                      const balanceCents = invoiceRows.reduce((total, invoice) => total + invoice.balanceCents, 0);
                      return (
                        <React.Fragment key={group.id}>
                          <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <TableCell className="px-5 py-4">
                              <button
                                className="flex items-center gap-3 font-semibold text-parcelis-charcoal"
                                onClick={() => toggleUnit(group.id)}
                                type="button"
                              >
                                <span className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border">
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </span>
                                <DoorOpen className="h-4 w-4 text-parcelis-green" />
                                Unit {group.unitLabel} · {group.property.name}
                              </button>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">Unit {group.unitLabel}</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                              {formatCurrency(amountCents)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-right text-parcelis-gray">
                              {formatCurrency(paidCents)}
                            </TableCell>
                            <TableCell
                              className={`px-5 py-4 text-right font-semibold ${balanceCents ? "text-parcelis-charcoal" : "text-parcelis-gray"}`}
                            >
                              {formatCurrency(balanceCents)}
                            </TableCell>
                          </TableRow>
                          {isExpanded
                            ? group.incomeLeases.map((lease) => {
                                const tenantName = getTenantName(lease);
                                const persistedInvoices = getLeaseInvoices(lease);
                                const activeInvoices = persistedInvoices.filter((invoice) => invoice.status !== "void");
                                if (activeInvoices.length === 0) {
                                  return (
                                    <TableRow
                                      className="border-t border-parcelis-border bg-parcelis-porcelain/45"
                                      key={`lease-${lease.id}-no-invoices`}
                                    >
                                      <TableCell className="px-5 py-3">
                                        <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 font-semibold text-parcelis-charcoal">
                                          <span />
                                          <span className="flex items-center gap-2">
                                            {tenantName}
                                            {lease.status === "scheduled" ? (
                                              <span className="text-xs font-medium text-parcelis-gray">
                                                Scheduled lease
                                              </span>
                                            ) : null}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm text-parcelis-gray" colSpan={9}>
                                        {persistedInvoices.length === 0
                                          ? "No saved invoices for this unit. Create an invoice using New Invoice."
                                          : "No active invoices for this unit. Existing saved invoices are voided."}
                                      </TableCell>
                                    </TableRow>
                                  );
                                }
                                return activeInvoices.map((invoice) => {
                                  return (
                                    <TableRow
                                      className="cursor-pointer border-t border-parcelis-border bg-parcelis-porcelain/45 hover:bg-parcelis-porcelain/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                                      key={invoice.id}
                                      onClick={() => {
                                        router.push(getInvoiceLink(invoice.id));
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          router.push(getInvoiceLink(invoice.id));
                                        }
                                      }}
                                      role="link"
                                      tabIndex={0}
                                    >
                                      <TableCell className="px-5 py-3">
                                        <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 font-semibold text-parcelis-charcoal">
                                          <span />
                                          <span className="flex items-center gap-2">
                                            {tenantName}
                                            {lease.status === "scheduled" ? (
                                              <span className="text-xs font-medium text-parcelis-gray">
                                                Scheduled lease
                                              </span>
                                            ) : null}
                                          </span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="px-5 py-3">
                                        <div className="flex items-center gap-2 font-semibold text-parcelis-charcoal">
                                          <DoorOpen className="h-4 w-4 text-parcelis-green" />
                                          Unit {lease.unitLabel}
                                        </div>
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                        {formatDate(invoice.dueOn)}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                        {invoice.paidOn ? formatDate(invoice.paidOn) : "—"}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm font-medium text-parcelis-charcoal">
                                        <Link
                                          className="text-parcelis-green hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parcelis-green"
                                          href={getInvoiceLink(Number.parseInt(String(invoice.id), 10))}
                                        >
                                          {formatInvoiceNumber(invoice.invoiceNumber)}
                                        </Link>
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                        {getIncomeInvoiceStatus(invoice, today)}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm font-semibold text-parcelis-charcoal">
                                        {formatCurrency(invoice.amountCents)}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm text-parcelis-gray">
                                        —
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm text-parcelis-gray">
                                        {formatCurrency(
                                          invoice.status === "void" ? 0 : invoice.amountCents - invoice.balanceCents,
                                        )}
                                      </TableCell>
                                      <TableCell
                                        className={`px-5 py-3 text-right text-sm font-semibold ${isUpcomingInvoice(invoice, today) ? "text-parcelis-gray" : getReceivableStatus(invoice, today) === "overdue" ? "text-red-700" : "text-parcelis-gray"}`}
                                      >
                                        {formatCurrency(invoice.status === "void" ? 0 : invoice.balanceCents)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                });
                              })
                            : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Table className="min-w-[1480px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[26%] px-5 py-3 font-semibold">Property / Shared by</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Due on</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Paid on</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Invoice ID</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Unit</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Amount</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Processing</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Paid</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Balance</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeLeases
                      .filter(({ lease }) => getLeaseInvoices(lease).length === 0)
                      .map(({ property, lease }) => (
                        <TableRow key={`lease-${lease.id}-no-invoices`}>
                          <TableCell className="px-5 py-4">
                            <p className="font-semibold text-parcelis-charcoal">{property.name}</p>
                            <p className="text-sm text-parcelis-gray">
                              Unit {lease.unitLabel} · {getTenantName(lease)}
                            </p>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray" colSpan={9}>
                            No saved invoices for this lease. Create an invoice using New Invoice.
                          </TableCell>
                        </TableRow>
                      ))}
                    {incomeLeases
                      .filter(({ lease }) => {
                        const persistedInvoices = getLeaseInvoices(lease);
                        return (
                          persistedInvoices.length > 0 &&
                          persistedInvoices.every((invoice) => invoice.status === "void")
                        );
                      })
                      .map(({ property, lease }) => (
                        <TableRow key={`lease-${lease.id}-only-void-invoices`}>
                          <TableCell className="px-5 py-4">
                            <p className="font-semibold text-parcelis-charcoal">{property.name}</p>
                            <p className="text-sm text-parcelis-gray">
                              Unit {lease.unitLabel} · {getTenantName(lease)}
                            </p>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray" colSpan={9}>
                            No active invoices for this lease. Existing saved invoices are voided.
                          </TableCell>
                        </TableRow>
                      ))}
                    {ungroupedIncomeRows.map(({ property, lease, invoice }) => {
                      return (
                        <TableRow
                          className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                          key={invoice.id}
                          onClick={() => {
                            router.push(getInvoiceLink(invoice.id));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(getInvoiceLink(invoice.id));
                            }
                          }}
                          role="link"
                          tabIndex={0}
                        >
                          <TableCell className="px-5 py-4">
                            <div className="space-y-1">
                              <p className="font-semibold text-parcelis-charcoal">{property.name}</p>
                              <p className="text-sm text-parcelis-gray">
                                Unit {lease.unitLabel} · {getTenantName(lease)}
                                {lease.status === "scheduled" ? " · Scheduled lease" : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {formatDate(invoice.dueOn)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {invoice.paidOn ? formatDate(invoice.paidOn) : "—"}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            <Link
                              className="font-medium text-parcelis-green hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parcelis-green"
                              href={getInvoiceLink(Number.parseInt(String(invoice.id), 10))}
                            >
                              {formatInvoiceNumber(invoice.invoiceNumber)}
                            </Link>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            <span className="font-medium text-parcelis-charcoal">{lease.unitLabel}</span>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm font-semibold text-parcelis-charcoal">
                            {formatCurrency(invoice.amountCents)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm text-parcelis-gray">—</TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm text-parcelis-gray">
                            {formatCurrency(invoice.status === "void" ? 0 : invoice.amountCents - invoice.balanceCents)}
                          </TableCell>
                          <TableCell
                            className={`px-5 py-4 text-right text-sm font-semibold ${isUpcomingInvoice(invoice, today) ? "text-parcelis-gray" : getReceivableStatus(invoice, today) === "overdue" ? "text-red-700" : "text-parcelis-gray"}`}
                          >
                            {formatCurrency(invoice.status === "void" ? 0 : invoice.balanceCents)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {getIncomeInvoiceStatus(invoice, today)}
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
        <InvoiceDrawer
          charges={chargesQuery.data ?? []}
          error={createInvoice.error}
          isPending={createInvoice.isPending}
          onCreate={(input) => createInvoice.mutate(input)}
          onOpenChange={setIsInvoiceDrawerOpen}
          open={isInvoiceDrawerOpen}
          properties={properties}
        />
      </section>
    </main>
  );
}
