"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  CircleDollarSign,
  ClipboardEdit,
  DoorOpen,
  PenLine,
  RefreshCw,
  UserRoundCog,
  UserRound,
  XCircle,
} from "lucide-react";
import { Button, Card, CardContent, CardHeader, ParcelisLogo } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { StickyNotePlusIcon } from "../../../../components/sticky-note-plus-icon";
import { getPropertyLink, getTenantLink, getUnitLink } from "../../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

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

function formatStatus(status: string) {
  if (status === "draft") return "Pending";
  if (status === "ended") return "Expired";
  return status
    .split("_")
    .map((part) => `${part[0] ?? ""}${part.slice(1)}`.replace(/^./, (character) => character.toUpperCase()))
    .join(" ");
}

function statusTone(status: string) {
  if (status === "active") return "text-parcelis-green";
  if (status === "notice" || status === "draft") return "text-amber-400";
  return "text-red-400";
}

function dueDay(value: Date | string | undefined) {
  if (!value) return "Not set";
  const day = new Date(value).getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix} of each month`;
}

export default function LeaseDetailPage() {
  const params = useParams<{ id: string }>();
  const leaseId = Number(params.id);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const leaseRecord = (propertiesQuery.data ?? [])
    .flatMap((property) => property.leases.map((lease) => ({ ...lease, property })))
    .find((lease) => lease.id === leaseId);
  const unit = leaseRecord?.property.units.find((item) => item.name === leaseRecord.unitLabel);
  const firstInvoice = leaseRecord?.invoices[0];

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-parcelis-border bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/leases">
                <ArrowLeft className="h-4 w-4" />
                Leases
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="min-w-40" variant="secondary">
              <RefreshCw className="h-4 w-4" />
              Renew Lease
            </Button>
            <Button className="min-w-40" variant="secondary">
              <UserRoundCog className="h-4 w-4" />
              Edit Tenants
            </Button>
            <Button className="min-w-40" variant="secondary">
              <StickyNotePlusIcon />
              Notes
            </Button>
            <Button className="min-w-40" variant="danger">
              <XCircle className="h-4 w-4" />
              Terminate
            </Button>
            <Button className="min-w-40" variant="secondary">
              <ClipboardEdit className="h-4 w-4" />
              Initiate Damage Report
            </Button>
            <Button className="min-w-40" variant="primary">
              <PenLine className="h-4 w-4" />
              Edit Lease
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell">
          {propertiesQuery.isLoading ? (
            <LoadingState label="Loading lease…" />
          ) : propertiesQuery.error ? (
            <div className="min-h-48 rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
              {propertiesQuery.error.message}
            </div>
          ) : !leaseRecord ? (
            <div className="min-h-48 rounded-lg border border-parcelis-border bg-white p-5 text-sm text-parcelis-gray">
              This lease could not be found.{" "}
              <Link className="font-semibold text-parcelis-green hover:underline" href="/leases">
                Return to leases
              </Link>
            </div>
          ) : (
            <>
              <section className="rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">
                      Lease details
                    </p>
                    <h1 className="mt-5 text-2xl font-bold md:text-4xl">
                      {leaseRecord.property.name} | Unit {leaseRecord.unitLabel}{" "}
                    </h1>
                    <p className="mt-3 text-md leading-6 text-white/75">
                      {formatDate(leaseRecord.startsOn)} · {formatDate(leaseRecord.endsOn)}
                    </p>
                  </div>
                  <div className="w-full rounded-md bg-white/10 p-4 md:w-52">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                      <BadgeCheck className={`h-4 w-4 ${statusTone(leaseRecord.status)}`} />
                      Lease Status
                    </div>
                    <p className="mt-2 text-2xl font-bold text-white">{formatStatus(leaseRecord.status)}</p>
                  </div>
                </div>
              </section>
              <section className="mt-5 flex flex-col gap-5 md:flex-row">
                <Metric
                  icon={CircleDollarSign}
                  label="Monthly Rent"
                  value={formatCurrency(leaseRecord.monthlyRentCents)}
                />
                <Metric icon={CalendarDays} label="Rent Due" value={dueDay(firstInvoice?.dueOn)} />
              </section>
              <section className="mt-5 flex flex-col gap-5 lg:flex-row">
                <Card className="flex-1">
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Lease Information</h2>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-4">
                    <Detail icon={Building2} label="Property">
                      <Link
                        className="font-semibold text-parcelis-green hover:underline"
                        href={getPropertyLink(leaseRecord.property.id)}
                      >
                        {leaseRecord.property.name}
                      </Link>
                    </Detail>
                    <Detail icon={DoorOpen} label="Unit">
                      {unit ? (
                        <Link
                          className="font-semibold text-parcelis-green hover:underline"
                          href={getUnitLink(leaseRecord.property.id, unit.id)}
                        >
                          Unit {leaseRecord.unitLabel}
                        </Link>
                      ) : (
                        `Unit ${leaseRecord.unitLabel}`
                      )}
                    </Detail>
                    <Detail icon={CalendarDays} label="Lease Start">
                      {formatDate(leaseRecord.startsOn)}
                    </Detail>
                    <Detail icon={CalendarRange} label="Lease End">
                      {formatDate(leaseRecord.endsOn)}
                    </Detail>
                    <Detail icon={CircleDollarSign} label="Monthly Rent">
                      {formatCurrency(leaseRecord.monthlyRentCents)}
                    </Detail>
                    <Detail icon={CalendarDays} label="Rent Due Date">
                      {dueDay(firstInvoice?.dueOn)}
                    </Detail>
                  </CardContent>
                </Card>
                <Card className="flex-1">
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Associated Tenants</h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {leaseRecord.tenants.map((tenant) => (
                      <Link
                        className="flex items-center gap-3 rounded-md border border-parcelis-border p-3 transition hover:border-parcelis-green hover:bg-parcelis-porcelain"
                        href={getTenantLink(tenant.id)}
                        key={tenant.id}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-parcelis-porcelain text-parcelis-green">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-parcelis-charcoal">
                          {tenant.firstName} {tenant.lastName}
                        </span>
                      </Link>
                    ))}
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

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <Card className="flex-1">
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-parcelis-gray">{label}</p>
          <Icon className="h-4 w-4 text-parcelis-green" />
        </div>
        <p className="mt-2 text-xl font-bold text-parcelis-charcoal">{value}</p>
      </CardContent>
    </Card>
  );
}

function Detail({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon: typeof CalendarDays;
  label: string;
}) {
  return (
    <div className="w-full rounded-md border border-parcelis-border p-4 sm:w-[calc(50%-0.5rem)]">
      <Icon className="h-4 w-4 text-parcelis-green" />
      <p className="mt-3 text-sm text-parcelis-gray">{label}</p>
      <div className="mt-1 text-sm text-parcelis-charcoal">{children}</div>
    </div>
  );
}
