"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Banknote, Building2, CalendarDays, FileText, Mail, Phone, UserRound } from "lucide-react";
import { Button, Card, CardContent, CardHeader, ParcelisLogo, Select } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LoadingState } from "../../../../components/loading-state";
import { getPropertyLink } from "../../../../lib/entity-links";

const brandLogoUrl = process.env.NEXT_PUBLIC_BRAND_LOGO_URL;
const darkBrandLogoUrl = process.env.NEXT_PUBLIC_DARK_BRAND_LOGO_URL;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function ApplicationDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const queryClient = useQueryClient();

  const applicationQuery = useQuery({
    queryKey: queryKeys.applications.byId(id),
    queryFn: () => apiClient.applications.byId.query({ id }),
    enabled: id > 0,
  });
  const statusesQuery = useQuery({
    queryKey: queryKeys.applicationStatuses.list,
    queryFn: () => apiClient.applicationStatuses.list.query(),
  });
  const updateStatus = useMutation({
    mutationFn: (statusId: number) => apiClient.applications.updateStatus.mutate({ id, statusId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.list });
      toast.success("Application status updated.");
    },
  });

  const application = applicationQuery.data;
  const statuses = (statusesQuery.data ?? []).filter(
    (status) => status.isActive || status.id === application?.status.id,
  );

  return (
    <main className="min-h-screen bg-parcelis-porcelain">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8 dark:bg-parcelis-slate/90">
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <ParcelisLogo darkLogoSrc={darkBrandLogoUrl} logoSrc={brandLogoUrl} markOnly />
            </div>
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/applications">
                <ArrowLeft className="h-4 w-4" />
                Applications
              </Link>
            </Button>
          </div>
        </header>
        <div className="parcelis-page-shell">
          {applicationQuery.isLoading ? (
            <LoadingState label="Loading application…" />
          ) : applicationQuery.error ? (
            <div className="flex min-h-48 flex-col items-start gap-3 text-sm font-medium text-red-700">
              <p>Unable to load this application. Please try again.</p>
              <Button onClick={() => applicationQuery.refetch()} type="button" variant="secondary">
                Retry
              </Button>
            </div>
          ) : !application ? (
            <p className="text-sm text-parcelis-gray">Application not found.</p>
          ) : (
            <>
              <section className="mb-6 rounded-lg bg-parcelis-charcoal p-6 text-white">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <span className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">
                        Application
                      </p>
                      <h1 className="mt-3 text-3xl font-bold">
                        {application.applicant.firstName} {application.applicant.lastName}
                      </h1>
                      <Link
                        className="mt-2 inline-block text-sm text-white/75 hover:underline"
                        href={getPropertyLink(application.property.id)}
                      >
                        {application.property.name}
                      </Link>
                    </div>
                  </div>
                  <div className="w-full lg:w-72">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/70">Status</p>
                    {statusesQuery.isLoading ? (
                      <p className="text-sm text-white/75">Loading statuses…</p>
                    ) : statusesQuery.error ? (
                      <div className="flex flex-col items-start gap-2">
                        <p className="text-sm text-red-200">Unable to load statuses.</p>
                        <Button onClick={() => statusesQuery.refetch()} type="button" variant="secondary">
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <Select
                        className="border-white/20 bg-white/10 text-white"
                        disabled={updateStatus.isPending}
                        onChange={(event) => updateStatus.mutate(Number(event.target.value))}
                        value={application.status.id}
                      >
                        {statuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
              </section>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Applicant</h2>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DetailRow icon={UserRound} label="Name">
                      {application.applicant.firstName} {application.applicant.lastName}
                    </DetailRow>
                    <DetailRow icon={Mail} label="Email">
                      {application.applicant.email}
                    </DetailRow>
                    <DetailRow icon={Phone} label="Phone">
                      {application.applicant.phone ?? "Not set"}
                    </DetailRow>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Application details</h2>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DetailRow icon={Building2} label="Property">
                      {application.property.name}
                    </DetailRow>
                    <DetailRow icon={Banknote} label="Annual income">
                      {formatCurrency(application.annualIncomeCents)}
                    </DetailRow>
                    <DetailRow icon={CalendarDays} label="Submitted on">
                      {formatDate(application.submittedOn)}
                    </DetailRow>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function DetailRow({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-parcelis-porcelain text-parcelis-green">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase text-parcelis-gray">{label}</p>
        <p className="mt-1 font-semibold text-parcelis-charcoal">{children}</p>
      </div>
    </div>
  );
}
