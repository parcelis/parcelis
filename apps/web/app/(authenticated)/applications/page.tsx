"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ChevronRight, Plus } from "lucide-react";
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
import type { CreateApplicationInput } from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../components/api-client";
import { ApplicationDrawer } from "../../../components/application-drawer";
import { LoadingState } from "../../../components/loading-state";
import { SearchGroupToolbar } from "../../../components/search-group-toolbar";
import { entityCreatedMessage } from "../../../components/toast-messages";
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
  const normalized = normalizeApplicationStatusLabel(label);
  if (normalized === "approved" || normalized === "lease created") return "bg-emerald-500/15 text-emerald-700";
  if (normalized === "for review") return "bg-sky-500/15 text-sky-700";
  if (normalized === "pending") return "bg-amber-500/15 text-amber-700";
  if (["rejected", "declined", "denied"].includes(normalized)) return "bg-red-500/15 text-red-700";
  if (normalized === "expired") return "bg-parcelis-porcelain text-parcelis-gray";
  return "bg-parcelis-porcelain text-parcelis-gray";
}

function normalizeApplicationStatusLabel(label: string) {
  return label.trim().toLowerCase();
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
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const applicationsQuery = useQuery({
    queryKey: queryKeys.applications.list,
    queryFn: () => apiClient.applications.list.query(),
  });
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const statusesQuery = useQuery({
    queryKey: queryKeys.applicationStatuses.list,
    queryFn: () => apiClient.applicationStatuses.list.query(),
  });
  const createApplication = useMutation({
    mutationFn: (input: CreateApplicationInput) => apiClient.applications.create.mutate(input),
    onSuccess: async (_application, variables) => {
      setIsDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.applications.list });
      toast.success(
        entityCreatedMessage("Application", `${variables.applicant.firstName} ${variables.applicant.lastName}`),
      );
    },
  });
  const applications = applicationsQuery.data ?? [];
  const properties = propertiesQuery.data ?? [];
  const statuses = (statusesQuery.data ?? []).filter((status) => status.isActive);
  const optionsError = propertiesQuery.error ?? statusesQuery.error;
  const areOptionsReady =
    propertiesQuery.isSuccess && statusesQuery.isSuccess && properties.length > 0 && statuses.length > 0;
  const totalApplications = applications.length;
  const forReviewCount = applications.filter(
    (application) => normalizeApplicationStatusLabel(application.status.label) === "for review",
  ).length;
  const approvedCount = applications.filter(
    (application) => normalizeApplicationStatusLabel(application.status.label) === "approved",
  ).length;
  const rejectedCount = applications.filter((application) =>
    ["rejected", "declined", "denied"].includes(normalizeApplicationStatusLabel(application.status.label)),
  ).length;

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
    <main className="flex-1">
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
          <Button className="min-w-40" disabled={!areOptionsReady} onClick={() => setIsDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            Application
          </Button>
        </header>
        <div className="parcelis-page-shell">
          {optionsError ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              Unable to load the property or status options required to create an application. Please try again.
            </div>
          ) : null}
          <section className="mb-6 flex flex-col gap-5 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Applications</p>
              <h1 className="mt-5 text-3xl font-bold md:text-5xl">Applications dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Track applicant status across your portfolio, from initial review through lease creation.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-4 md:min-w-[540px]">
              <Metric label="Total" value={totalApplications} />
              <Metric label="For Review" value={forReviewCount} />
              <Metric label="Approved" value={approvedCount} />
              <Metric label="Rejected" value={rejectedCount} />
            </div>
          </section>

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
                                  className="cursor-pointer border-t border-parcelis-border bg-parcelis-porcelain/45 hover:bg-parcelis-porcelain/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parcelis-green"
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
        <ApplicationDrawer
          drawerTitle="New Application"
          error={createApplication.error ?? optionsError}
          isPending={createApplication.isPending}
          onOpenChange={setIsDrawerOpen}
          onSubmit={(input) => createApplication.mutate(input)}
          open={isDrawerOpen}
          properties={properties}
          statuses={statuses}
          submitLabel="Create Application"
        />
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
