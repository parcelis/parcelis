"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Filter, Plus, Search, UserRound } from "lucide-react";
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
import { LeaseDrawer } from "../../../components/lease-drawer";
import { apiClient, queryKeys } from "../../../components/api-client";
import { LoadingState } from "../../../components/loading-state";
import { toast } from "sonner";
import { getPropertyLink, getTenantLink } from "../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

type LeaseFilters = {
  status: string;
};

const initialFilters: LeaseFilters = {
  status: "all",
};

function formatDate(value: Date | string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value))
    : "Month-to-month";
}
function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}
function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0] ?? ""}${part.slice(1)}`.replace(/^./, (character) => character.toUpperCase()))
    .join(" ");
}
function statusClass(value: string) {
  if (value === "active") return "text-parcelis-green";
  if (value === "notice") return "text-amber-600";
  if (value === "ended") return "text-red-700";
  return "text-parcelis-gray";
}

export default function LeasesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [draftFilters, setDraftFilters] = React.useState<LeaseFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = React.useState<LeaseFilters>(initialFilters);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const createLease = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.leases.create.mutate>[0]) => apiClient.leases.create.mutate(input),
    onSuccess: async () => {
      setDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
      toast.success("Lease created.");
    },
  });
  const leases = (propertiesQuery.data ?? []).flatMap((property) =>
    property.leases.map((lease) => ({ ...lease, property })),
  );
  const filteredLeases = leases.filter((lease) => {
    const query = search.toLowerCase();
    return (
      (appliedFilters.status === "all" || lease.status === appliedFilters.status) &&
      [
        lease.property.name,
        lease.unitLabel,
        `Unit ${lease.unitLabel}`,
        ...lease.tenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`),
      ].some((value) => value.toLowerCase().includes(query))
    );
  });
  const activeLeases = leases.filter((lease) => lease.status === "active");
  const noticeLeases = leases.filter((lease) => lease.status === "notice");
  const expiringLeases = activeLeases.filter((lease) => {
    if (!lease.endsOn) return false;
    const days = (new Date(lease.endsOn).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 90;
  });
  const activeFilterCount = appliedFilters.status === "all" ? 0 : 1;

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setIsFilterOpen(false);
  }

  function clearFilters() {
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setIsFilterOpen(false);
  }

  return (
    <main className="flex-1">
      <LeaseDrawer
        error={createLease.error}
        isPending={createLease.isPending}
        onOpenChange={setDrawerOpen}
        onSubmit={(input) => createLease.mutate(input)}
        open={drawerOpen}
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
          <Button className="min-w-40" onClick={() => setDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            Lease
          </Button>
        </header>
        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Leases</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Lease dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Track lease terms, residents, rent, and upcoming expirations across the portfolio.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-4 md:min-w-[540px]">
              <Metric label="All leases" value={leases.length} />
              <Metric label="Active" value={activeLeases.length} />
              <Metric label="Expiring soon" value={expiringLeases.length} />
              <Metric label="Notice given" value={noticeLeases.length} />
            </div>
          </section>
          <Card>
            <CardHeader>
              <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="font-semibold text-parcelis-charcoal">All leases</h2>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
                    <Search className="h-4 w-4" />
                    <Input
                      className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search property, unit, resident"
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
                  <div className="absolute right-0 top-full z-20 mt-3 w-full max-w-sm rounded-lg border border-parcelis-border bg-white p-5 shadow-lg">
                    <Label className="gap-2">
                      <span>Lease Status</span>
                      <Select
                        onChange={(event) => setDraftFilters({ status: event.target.value })}
                        value={draftFilters.status}
                      >
                        <option value="all">All statuses</option>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="notice">Notice given</option>
                        <option value="ended">Ended</option>
                      </Select>
                    </Label>
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
                <LoadingState label="Loading leases…" />
              ) : propertiesQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">{propertiesQuery.error.message}</div>
              ) : filteredLeases.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {leases.length === 0
                    ? "No leases yet. Create your first lease to get started."
                    : "No leases match your search."}
                </div>
              ) : (
                <Table className="min-w-[1060px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-64 px-5 py-3 font-semibold">Property / unit</TableHead>
                      <TableHead className="w-64 px-5 py-3 font-semibold">Residents</TableHead>
                      <TableHead className="w-36 px-5 py-3 font-semibold">Term</TableHead>
                      <TableHead className="w-36 px-5 py-3 font-semibold">Monthly rent</TableHead>
                      <TableHead className="w-32 px-5 py-3 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeases.map((lease) => (
                      <TableRow
                        className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60"
                        key={lease.id}
                      >
                        <TableCell className="px-5 py-4">
                          <Link
                            className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                            href={getPropertyLink(lease.property.id)}
                          >
                            {lease.property.name}
                          </Link>
                          <p className="mt-1 text-sm text-parcelis-gray">Unit {lease.unitLabel}</p>
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          {lease.tenants.map((tenant) => (
                            <Link
                              className="mb-1 flex items-center gap-2 text-sm font-medium text-parcelis-charcoal hover:text-parcelis-green"
                              href={getTenantLink(tenant.id)}
                              key={tenant.id}
                            >
                              <UserRound className="h-4 w-4 text-parcelis-green" />
                              {tenant.firstName} {tenant.lastName}
                            </Link>
                          ))}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                          <p>{formatDate(lease.startsOn)}</p>
                          <p className="mt-1">to {formatDate(lease.endsOn)}</p>
                        </TableCell>
                        <TableCell className="px-5 py-4 font-semibold text-parcelis-charcoal">
                          {formatCurrency(lease.monthlyRentCents)}
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <span className={`inline-flex items-center gap-2 font-semibold ${statusClass(lease.status)}`}>
                            <CalendarClock className="h-4 w-4" />
                            {formatStatus(lease.status)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
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
