"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, DoorOpen } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  ParcelisLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@parcelis/ui";
import { apiClient, queryKeys } from "../../components/api-client";
import { LoadingState } from "../../components/loading-state";
import { Sidebar } from "../../components/sidebar";

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

export default function IncomePage() {
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [groupByProperty, setGroupByProperty] = React.useState(true);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const properties = propertiesQuery.data ?? [];
  const incomeProperties = properties
    .map((property) => ({
      ...property,
      incomeLeases: property.leases.filter((lease) => lease.status === "active" || lease.status === "notice"),
    }))
    .filter((property) => property.incomeLeases.length > 0);
  const scheduledIncomeCents = incomeProperties.reduce((total, property) => total + property.monthlyRentCents, 0);
  const overdueCents = incomeProperties.reduce((total, property) => total + property.amountOverdueCents, 0);
  const expectedIncomeCents = Math.max(scheduledIncomeCents - overdueCents, 0);
  const incomeLeases = incomeProperties.flatMap((property) =>
    property.incomeLeases.map((lease) => ({ property, lease })),
  );

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
      <Sidebar active="income" />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/">Portfolio</Link>
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell">
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Income</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Income dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Monitor scheduled rent and overdue balances across your portfolio.
              </p>
            </div>
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
          </section>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                <Button onClick={() => setGroupByProperty((grouped) => !grouped)} type="button" variant="secondary">
                  {groupByProperty ? "Grouped By Property" : " Not Grouped"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {propertiesQuery.isLoading ? (
                <LoadingState label="Loading income…" />
              ) : propertiesQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">
                  Unable to load income. Please try again.
                </div>
              ) : incomeProperties.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  No active leases are available to report income yet.
                </div>
              ) : groupByProperty ? (
                <Table className="min-w-[840px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[44%] px-5 py-3 font-semibold">Property / Unit</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Lease status</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Scheduled rent</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeProperties.map((property) => {
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
                            <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                              {formatCurrency(property.monthlyRentCents)}
                            </TableCell>
                            <TableCell
                              className={`px-5 py-4 text-right font-semibold ${property.amountOverdueCents ? "text-red-700" : "text-parcelis-gray"}`}
                            >
                              {formatCurrency(property.amountOverdueCents)}
                            </TableCell>
                          </TableRow>
                          {isExpanded
                            ? property.incomeLeases.map((lease) => (
                                <TableRow
                                  className="border-t border-parcelis-border bg-parcelis-porcelain/45"
                                  key={lease.unitLabel}
                                >
                                  <TableCell className="px-5 py-3">
                                    <Link
                                      className="grid grid-cols-[2rem_2rem_minmax(0,1fr)] items-center gap-3 font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                                      href={`/properties/${property.id}`}
                                    >
                                      <span />
                                      <DoorOpen className="h-4 w-4 text-parcelis-green" />
                                      Unit {lease.unitLabel}
                                    </Link>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-sm text-parcelis-gray">
                                    {formatLeaseStatus(lease.status)}
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-right text-sm font-semibold text-parcelis-charcoal">
                                    {formatCurrency(lease.monthlyRentCents)}
                                  </TableCell>
                                  <TableCell
                                    className={`px-5 py-3 text-right text-sm font-semibold ${lease.amountOverdueCents ? "text-red-700" : "text-parcelis-gray"}`}
                                  >
                                    {formatCurrency(lease.amountOverdueCents)}
                                  </TableCell>
                                </TableRow>
                              ))
                            : null}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Table className="min-w-[900px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[36%] px-5 py-3 font-semibold">Unit</TableHead>
                      <TableHead className="w-[28%] px-5 py-3 font-semibold">Property</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Lease status</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Scheduled rent</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomeLeases.map(({ property, lease }) => (
                      <TableRow
                        className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60"
                        key={`${property.id}-${lease.unitLabel}`}
                      >
                        <TableCell className="px-5 py-4">
                          <Link
                            className="flex items-center gap-3 font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                            href={`/properties/${property.id}`}
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
                              <DoorOpen className="h-4 w-4" />
                            </span>
                            Unit {lease.unitLabel}
                          </Link>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm font-medium text-parcelis-charcoal">
                          {property.name}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                          {formatLeaseStatus(lease.status)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right text-sm font-semibold text-parcelis-charcoal">
                          {formatCurrency(lease.monthlyRentCents)}
                        </TableCell>
                        <TableCell
                          className={`px-5 py-4 text-right text-sm font-semibold ${lease.amountOverdueCents ? "text-red-700" : "text-parcelis-gray"}`}
                        >
                          {formatCurrency(lease.amountOverdueCents)}
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
