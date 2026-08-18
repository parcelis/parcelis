"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, DoorOpen, Plus, Search } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  ParcelisLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../components/api-client";
import { LoadingState } from "../../../components/loading-state";
import { InvoiceDrawer } from "../../../components/invoice-drawer";
import { PageRail } from "../../../components/page-rail";
import { getInvoiceLink } from "../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

function getCurrentInvoice(lease: { amountOverdueCents: number; monthlyRentCents: number }) {
  const now = new Date();
  const dueOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return {
    amountCents: lease.monthlyRentCents,
    balanceCents: lease.amountOverdueCents || lease.monthlyRentCents,
    dueOn,
    id: `INV-${dueOn.getUTCFullYear()}-${String(dueOn.getUTCMonth() + 1).padStart(2, "0")}`,
    paidOn: null,
    status: lease.amountOverdueCents > 0 ? "Overdue" : "Current",
  };
}

function formatInvoiceStatus(invoice: { amountCents: number; balanceCents: number; status: string }) {
  if (invoice.balanceCents === 0 || invoice.status === "paid") return "Fully paid";
  if (invoice.balanceCents < invoice.amountCents) return "Partially paid";
  return formatLeaseStatus(invoice.status);
}

function getTenantName(lease: { tenant: { firstName: string; lastName: string } }) {
  return `${lease.tenant.firstName} ${lease.tenant.lastName}`;
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
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [groupByProperty, setGroupByProperty] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [isInvoiceDrawerOpen, setIsInvoiceDrawerOpen] = React.useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const tenantId = Number(searchParams.get("tenantId"));
  const selectedTenantId = Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null;
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const properties = propertiesQuery.data ?? [];
  const createInvoice = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.invoices.createManual.mutate>[0]) =>
      apiClient.invoices.createManual.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
      void queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
      setIsInvoiceDrawerOpen(false);
    },
  });
  const incomeProperties = properties
    .map((property) => {
      const incomeLeases = property.leases.filter(
        (lease) =>
          (lease.status === "active" || lease.status === "notice") &&
          (selectedTenantId === null || lease.tenant.id === selectedTenantId),
      );
      return {
        ...property,
        incomeLeases,
        amountOverdueCents: incomeLeases.reduce((total, lease) => total + lease.amountOverdueCents, 0),
        monthlyRentCents: incomeLeases.reduce((total, lease) => total + lease.monthlyRentCents, 0),
      };
    })
    .filter((property) => property.incomeLeases.length > 0);
  const scheduledIncomeCents = incomeProperties.reduce((total, property) => total + property.monthlyRentCents, 0);
  const overdueCents = incomeProperties.reduce((total, property) => total + property.amountOverdueCents, 0);
  const expectedIncomeCents = Math.max(scheduledIncomeCents - overdueCents, 0);
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
  const ungroupedIncomeRows = incomeLeases.flatMap(({ property, lease }) => {
    const persistedInvoices = getLeaseInvoices(lease);
    return (persistedInvoices.length ? persistedInvoices : [null]).map((persistedInvoice) => ({
      property,
      lease,
      invoice: persistedInvoice ?? getCurrentInvoice(lease),
      persistedInvoice,
    }));
  });

  function toggleProperty(propertyId: number) {
    setExpandedPropertyIds((current) => {
      const next = new Set(current);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8 dark:bg-parcelis-slate/90">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
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
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-3 md:min-w-[420px]">
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(scheduledIncomeCents)}</div>
                Scheduled monthly rent
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(expectedIncomeCents)}</div>
                Expected this month
              </div>
              <div className="rounded-md bg-white/10 p-3">
                <div className="text-2xl font-bold text-white">{formatCurrency(overdueCents)}</div>
                Overdue balance
              </div>
            </div>
          </PageRail>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-parcelis-charcoal">
                    {groupByProperty ? "Income by property" : "Income rent roll"}
                  </h2>
                  <p className="mt-1 text-sm text-parcelis-gray">
                    {groupByProperty
                      ? "Active and notice-period leases, grouped by property."
                      : "Active and notice-period leases listed by property and unit."}
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
                  <Button onClick={() => setGroupByProperty((grouped) => !grouped)} type="button" variant="secondary">
                    {groupByProperty ? "Grouped By Property" : " Not Grouped"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {propertiesQuery.isLoading ? (
                <LoadingState label="Loading income…" />
              ) : propertiesQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">
                  Unable to load income. Please try again.
                </div>
              ) : filteredIncomeProperties.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {incomeProperties.length === 0
                    ? "No active leases are available to report income yet."
                    : "No income records match your search."}
                </div>
              ) : groupByProperty ? (
                <Table className="min-w-[1360px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[28%] px-5 py-3 font-semibold">Property / Tenant</TableHead>
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
                    {filteredIncomeProperties.map((property) => {
                      const isExpanded = expandedPropertyIds.has(property.id);
                      return (
                        <React.Fragment key={property.id}>
                          <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <TableCell className="px-5 py-4">
                              <button
                                className="flex items-center gap-3 font-semibold text-parcelis-charcoal"
                                onClick={() => toggleProperty(property.id)}
                                type="button"
                              >
                                <span className="grid h-8 w-8 place-items-center rounded-md border border-parcelis-border">
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </span>
                                <Building2 className="h-4 w-4 text-parcelis-green" />
                                {property.name}
                                <span className="text-sm font-medium text-parcelis-gray">
                                  ({property.incomeLeases.length})
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                              {formatCurrency(property.monthlyRentCents)}
                            </TableCell>
                            <TableCell className="px-5 py-4 text-right text-parcelis-gray">—</TableCell>
                            <TableCell className="px-5 py-4 text-right text-parcelis-gray">—</TableCell>
                            <TableCell
                              className={`px-5 py-4 text-right font-semibold ${property.amountOverdueCents ? "text-red-700" : "text-parcelis-gray"}`}
                            >
                              {formatCurrency(property.amountOverdueCents)}
                            </TableCell>
                          </TableRow>
                          {isExpanded
                            ? property.incomeLeases.map((lease) => {
                                const tenantName = getTenantName(lease);
                                const persistedInvoices = getLeaseInvoices(lease);
                                const invoices = persistedInvoices.length ? persistedInvoices : [null];
                                return invoices.map((persistedInvoice) => {
                                  const invoice = persistedInvoice ?? getCurrentInvoice(lease);
                                  return (
                                    <TableRow
                                      className="cursor-pointer border-t border-parcelis-border bg-parcelis-porcelain/45 hover:bg-parcelis-porcelain/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                                      key={persistedInvoice ? persistedInvoice.id : `${lease.id}-current`}
                                      onClick={() => {
                                        if (persistedInvoice) router.push(getInvoiceLink(persistedInvoice.id));
                                      }}
                                      onKeyDown={(event) => {
                                        if (persistedInvoice && (event.key === "Enter" || event.key === " ")) {
                                          event.preventDefault();
                                          router.push(getInvoiceLink(persistedInvoice.id));
                                        }
                                      }}
                                      role={persistedInvoice ? "link" : undefined}
                                      tabIndex={persistedInvoice ? 0 : undefined}
                                    >
                                      <TableCell className="px-5 py-3">
                                        <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 font-semibold text-parcelis-charcoal">
                                          <span />
                                          {tenantName}
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
                                        {persistedInvoice?.paidOn ? formatDate(persistedInvoice.paidOn) : "—"}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm font-medium text-parcelis-charcoal">
                                        {persistedInvoice ? (
                                          <Link
                                            className="text-parcelis-green hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parcelis-green"
                                            href={getInvoiceLink(encodeURIComponent(String(persistedInvoice.id)))}
                                          >
                                            INV-{String(persistedInvoice.invoiceNumber).padStart(7, "0")}
                                          </Link>
                                        ) : (
                                          invoice.id
                                        )}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                        {persistedInvoice ? formatInvoiceStatus(persistedInvoice) : invoice.status}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm font-semibold text-parcelis-charcoal">
                                        {formatCurrency(
                                          persistedInvoice ? persistedInvoice.amountCents : lease.monthlyRentCents,
                                        )}
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm text-parcelis-gray">
                                        —
                                      </TableCell>
                                      <TableCell className="px-5 py-3 text-right text-sm text-parcelis-gray">
                                        {persistedInvoice
                                          ? formatCurrency(persistedInvoice.amountCents - persistedInvoice.balanceCents)
                                          : "—"}
                                      </TableCell>
                                      <TableCell
                                        className={`px-5 py-3 text-right text-sm font-semibold ${lease.amountOverdueCents ? "text-red-700" : "text-parcelis-gray"}`}
                                      >
                                        {formatCurrency(
                                          persistedInvoice ? persistedInvoice.balanceCents : lease.amountOverdueCents,
                                        )}
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
                    {ungroupedIncomeRows.map(({ property, lease, invoice, persistedInvoice }) => {
                      return (
                        <TableRow
                          className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                          key={persistedInvoice ? persistedInvoice.id : `${lease.id}-current`}
                          onClick={() => {
                            if (persistedInvoice) router.push(getInvoiceLink(persistedInvoice.id));
                          }}
                          onKeyDown={(event) => {
                            if (persistedInvoice && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault();
                              router.push(getInvoiceLink(persistedInvoice.id));
                            }
                          }}
                          role={persistedInvoice ? "link" : undefined}
                          tabIndex={persistedInvoice ? 0 : undefined}
                        >
                          <TableCell className="px-5 py-4">
                            <div className="space-y-1">
                              <p className="font-semibold text-parcelis-charcoal">{property.name}</p>
                              <p className="text-sm text-parcelis-gray">
                                Unit {lease.unitLabel} · {getTenantName(lease)}
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
                            {persistedInvoice ? (
                              <Link
                                className="font-medium text-parcelis-green hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parcelis-green"
                                href={getInvoiceLink(encodeURIComponent(String(persistedInvoice.id)))}
                              >
                                INV-{String(persistedInvoice.invoiceNumber).padStart(7, "0")}
                              </Link>
                            ) : (
                              <span className="font-medium text-parcelis-charcoal">{invoice.id}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            <span className="font-medium text-parcelis-charcoal">{lease.unitLabel}</span>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm font-semibold text-parcelis-charcoal">
                            {formatCurrency(invoice.amountCents)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm text-parcelis-gray">—</TableCell>
                          <TableCell className="px-5 py-4 text-right text-sm text-parcelis-gray">
                            {formatCurrency(invoice.amountCents - invoice.balanceCents)}
                          </TableCell>
                          <TableCell
                            className={`px-5 py-4 text-right text-sm font-semibold ${invoice.balanceCents ? "text-red-700" : "text-parcelis-gray"}`}
                          >
                            {formatCurrency(invoice.balanceCents)}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                            {formatInvoiceStatus(invoice)}
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
