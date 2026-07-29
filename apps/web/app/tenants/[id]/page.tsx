"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CircleDollarSign,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  Badge,
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
import { apiClient, queryKeys } from "../../../components/api-client";
import { Sidebar } from "../../../components/sidebar";

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
  const tenantId = Number(params.id);
  const tenantQuery = useQuery({
    queryKey: queryKeys.tenants.byId(tenantId),
    queryFn: () => apiClient.tenants.byId.query({ id: tenantId }),
    enabled: Number.isInteger(tenantId) && tenantId > 0,
  });
  const tenant = tenantQuery.data;
  const currentLease = tenant?.leases.find(
    (lease) => lease.status === "active" || lease.status === "notice",
  );
  const overdueCents = currentLease?.amountOverdueCents ?? 0;

  return (
    <main className="min-h-screen">
      <Sidebar active="tenants" />
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="lg:hidden">
            <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href="/tenants">
              <ArrowLeft className="h-4 w-4" />
              Tenants
            </Link>
          </Button>
        </header>

        <div className="parcelis-page-shell">
          {tenantQuery.isLoading ? (
            <div className="flex min-h-[60vh] items-center justify-center text-sm font-medium text-parcelis-gray">
              Loading tenant
            </div>
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
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-parcelis-green">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-parcelis-green">
                        {formatStatus(tenant.tenantStatus)}
                      </span>
                    </div>
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
                  <div className="grid gap-3 sm:grid-cols-3 lg:w-[36rem]">
                    <HeroStatus
                      icon={BadgeCheck}
                      label="Account Status"
                      status={tenant.accountStatus}
                    />
                    <HeroStatus
                      icon={ShieldCheck}
                      label="Insurance Status"
                      status={tenant.insuranceStatus}
                    />
                    <HeroStatus
                      icon={CalendarDays}
                      label="Tenant Status"
                      status={tenant.tenantStatus}
                    />
                  </div>
                </div>
              </section>

              <section className="grid gap-5 md:grid-cols-3">
                <MetricCard
                  icon={CalendarDays}
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
                            {currentLease.endsOn
                              ? formatDate(currentLease.endsOn)
                              : "Month-to-Month"}
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
                  detail={
                    overdueCents > 0
                      ? `${formatCurrency(overdueCents)} overdue`
                      : "No balance overdue"
                  }
                />
                <MetricCard
                  icon={BadgeCheck}
                  label="Lease History"
                  value={String(tenant.leases.length)}
                  detail={`${tenant.leases.filter((lease) => lease.status === "ended").length} completed`}
                />
              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Contact Information</h2>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div>
                      <p className="text-parcelis-gray">Email</p>
                      <a
                        className="font-semibold text-parcelis-charcoal hover:text-parcelis-green"
                        href={`mailto:${tenant.email}`}
                      >
                        {tenant.email}
                      </a>
                    </div>
                    <div>
                      <p className="text-parcelis-gray">Phone</p>
                      <p className="font-semibold text-parcelis-charcoal">
                        {tenant.phone ?? "Not provided"}
                      </p>
                    </div>
                    {tenant.archivedAt ? (
                      <div>
                        <p className="text-parcelis-gray">Archived</p>
                        <p className="font-semibold text-parcelis-charcoal">
                          {formatDate(tenant.archivedAt)}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Lease History</h2>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    {tenant.leases.length === 0 ? (
                      <p className="p-5 text-sm text-parcelis-gray">
                        No lease history is available.
                      </p>
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
                                  href={`/properties/${lease.property.id}`}
                                >
                                  {lease.property.name}
                                </Link>
                                <p className="mt-1 text-sm text-parcelis-gray">
                                  Unit {lease.unitLabel}
                                </p>
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

function HeroStatus({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof BadgeCheck;
  label: string;
  status?: string | null;
}) {
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
