"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight } from "lucide-react";
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
import { LoadingState } from "../../../components/loading-state";
import { PageRail } from "../../../components/page-rail";
import { SearchGroupToolbar } from "../../../components/search-group-toolbar";
import { getApplicationLink } from "../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getApplicantName(application: { applicant: { firstName: string; lastName: string } }) {
  return `${application.applicant.firstName} ${application.applicant.lastName}`;
}

function statusBadgeClass(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "approved" || normalized === "lease created") return "bg-emerald-500/15 text-emerald-700";
  if (normalized === "for review") return "bg-sky-500/15 text-sky-700";
  if (normalized === "pending") return "bg-amber-500/15 text-amber-700";
  if (normalized === "rejected" || normalized === "declined") return "bg-red-500/15 text-red-700";
  if (normalized === "expired") return "bg-parcelis-porcelain text-parcelis-gray";
  return "bg-parcelis-porcelain text-parcelis-gray";
}

export default function ApplicationsPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading applications..." />}>
      <ApplicationsPageContent />
    </React.Suspense>
  );
}

function ApplicationsPageContent() {
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(new Set());
  const [groupByProperty, setGroupByProperty] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const router = useRouter();

  const applicationsQuery = useQuery({
    queryKey: queryKeys.applications.list,
    queryFn: () => apiClient.applications.list.query(),
  });
  const applications = applicationsQuery.data ?? [];

  const normalizedSearch = search.trim().toLowerCase();
  const filteredApplications = applications.filter((application) =>
    [application.status.label, getApplicantName(application), application.property.name].some((value) =>
      value.toLowerCase().includes(normalizedSearch),
    ),
  );

  const groupedProperties = React.useMemo(() => {
    const groups = new Map<number, { id: number; name: string; applications: typeof filteredApplications }>();
    for (const application of filteredApplications) {
      const group = groups.get(application.property.id);
      if (group) {
        group.applications.push(application);
      } else {
        groups.set(application.property.id, {
          id: application.property.id,
          name: application.property.name,
          applications: [application],
        });
      }
    }
    return Array.from(groups.values());
  }, [filteredApplications]);

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
        </header>
        <div className="parcelis-page-shell">
          <PageRail
            description="Track applicant status across your portfolio, from initial review through lease creation."
            eyebrow="Applications"
            title="Applications dashboard"
          />

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-parcelis-charcoal">
                    {groupByProperty ? "Applications by property" : "All applications"}
                  </h2>
                  <p className="mt-1 text-sm text-parcelis-gray">
                    {groupByProperty
                      ? "Applications grouped by the property they were submitted for."
                      : "Applications listed by applicant."}
                  </p>
                </div>
                <SearchGroupToolbar
                  groupBy={groupByProperty}
                  groupedLabel="Grouped By Property"
                  onSearchChange={setSearch}
                  onToggleGroupBy={() => setGroupByProperty((grouped) => !grouped)}
                  search={search}
                  searchPlaceholder="Search status, applicant, property"
                  ungroupedLabel="Not Grouped"
                />
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {applicationsQuery.isLoading ? (
                <LoadingState label="Loading applications…" />
              ) : applicationsQuery.error ? (
                <div className="min-h-48 p-5 text-sm font-medium text-red-700">
                  Unable to load applications. Please try again.
                </div>
              ) : filteredApplications.length === 0 ? (
                <div className="min-h-48 p-5 text-sm text-parcelis-gray">
                  {applications.length === 0
                    ? "No applications have been submitted yet."
                    : "No applications match your search."}
                </div>
              ) : groupByProperty ? (
                <Table className="min-w-[900px] border-collapse text-left">
                  <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                    <TableRow className="border-0">
                      <TableHead className="w-[35%] px-5 py-3 font-semibold">Property</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Applicant Name</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Annual Income</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedProperties.map((property) => {
                      const isExpanded = expandedPropertyIds.has(property.id);
                      return (
                        <React.Fragment key={property.id}>
                          <TableRow className="border-t border-parcelis-border hover:bg-parcelis-porcelain/60">
                            <TableCell className="px-5 py-4" colSpan={4}>
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
                                  ({property.applications.length})
                                </span>
                              </button>
                            </TableCell>
                          </TableRow>
                          {isExpanded
                            ? property.applications.map((application) => (
                                <TableRow
                                  className="cursor-pointer border-t border-parcelis-border bg-parcelis-porcelain/45 hover:bg-parcelis-porcelain/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                                  key={application.id}
                                  onClick={() => router.push(getApplicationLink(application.id))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      router.push(getApplicationLink(application.id));
                                    }
                                  }}
                                  role="link"
                                  tabIndex={0}
                                >
                                  <TableCell className="px-5 py-3" />
                                  <TableCell className="px-5 py-3">
                                    <Badge className={statusBadgeClass(application.status.label)} variant="secondary">
                                      {application.status.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-5 py-3 font-medium text-parcelis-charcoal">
                                    {getApplicantName(application)}
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-right font-semibold text-parcelis-charcoal">
                                    {formatCurrency(application.annualIncomeCents)}
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
                      <TableHead className="px-5 py-3 font-semibold">Status</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Applicant Name</TableHead>
                      <TableHead className="px-5 py-3 font-semibold">Property</TableHead>
                      <TableHead className="px-5 py-3 text-right font-semibold">Annual Income</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((application) => (
                      <TableRow
                        className="cursor-pointer border-t border-parcelis-border hover:bg-parcelis-porcelain/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
                        key={application.id}
                        onClick={() => router.push(getApplicationLink(application.id))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(getApplicationLink(application.id));
                          }
                        }}
                        role="link"
                        tabIndex={0}
                      >
                        <TableCell className="px-5 py-4">
                          <Badge className={statusBadgeClass(application.status.label)} variant="secondary">
                            {application.status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-5 py-4 font-medium text-parcelis-charcoal">
                          {getApplicantName(application)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-parcelis-gray">{application.property.name}</TableCell>
                        <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                          {formatCurrency(application.annualIncomeCents)}
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
