"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  BadgeCheck,
  BriefcaseBusiness,
  Cake,
  CalendarCheck,
  CalendarDays,
  Check,
  FileText,
  Mail,
  MapPin,
  Pencil,
  StickyNote,
  X,
} from "lucide-react";
import { Button, Card, CardContent, CardHeader } from "@parcelis/ui";
import type { UpdateApplicationInput } from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { ApplicationDrawer } from "../../../../components/application-drawer";
import { EntityLifecycleControls } from "../../../../components/entity-lifecycle-controls";
import { LoadingState } from "../../../../components/loading-state";
import { NotesDrawer } from "../../../../components/notes-drawer";
import { hasPermission } from "../../../../components/property-access";
import {
  entityArchivedMessage,
  entityDeletedMessage,
  entityReactivatedMessage,
  entityUpdatedMessage,
} from "../../../../components/toast-messages";
import { getPropertyLink } from "../../../../lib/entity-links";


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

function formatDateOnly(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getAge(dateOfBirth: Date | string | null) {
  if (!dateOfBirth) return "Not reported";
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getUTCFullYear();
  const birthdayHasPassed =
    today.getMonth() > birthDate.getUTCMonth() ||
    (today.getMonth() === birthDate.getUTCMonth() && today.getDate() >= birthDate.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age >= 0 ? `${age} years old` : "Not reported";
}

function formatApplicantAddress(applicant: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
}) {
  const cityRegionPostal = [applicant.city, [applicant.region, applicant.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [applicant.addressLine1, applicant.addressLine2, cityRegionPostal].filter(Boolean).join(", ");
}

export default function ApplicationDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isNotesOpen, setIsNotesOpen] = React.useState(false);
  const currentUserQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => apiClient.auth.me.query(),
  });

  const applicationQuery = useQuery({
    queryKey: queryKeys.applications.byId(id),
    queryFn: () => apiClient.applications.byId.query({ id }),
    enabled: id > 0,
  });
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });
  const statusesQuery = useQuery({
    queryKey: queryKeys.applicationStatuses.list,
    queryFn: () => apiClient.applicationStatuses.list.query(),
  });
  const updateApplication = useMutation({
    mutationFn: (input: Omit<UpdateApplicationInput, "id">) => apiClient.applications.update.mutate({ ...input, id }),
    onSuccess: async (_application, variables) => {
      setIsEditOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.list }),
      ]);
      toast.success(
        entityUpdatedMessage("Application", `${variables.applicant.firstName} ${variables.applicant.lastName}`),
      );
    },
  });
  const updateApplicationStatus = useMutation({
    mutationFn: (statusId: number) => apiClient.applications.updateStatus.mutate({ id, statusId }),
    onSuccess: async (_application, statusId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.applications.list }),
      ]);
      const status = statusesQuery.data?.find((item) => item.id === statusId);
      toast.success(`Application marked ${status?.label.toLowerCase() ?? "updated"}.`);
    },
  });

  const application = applicationQuery.data;
  const properties = propertiesQuery.data ?? [];
  const statuses = (statusesQuery.data ?? []).filter(
    (status) => status.isActive || status.id === application?.status.id,
  );
  const approvedStatus = statuses.find((status) => status.label.toLowerCase() === "approved");
  const deniedStatus = statuses.find((status) => ["rejected", "denied"].includes(status.label.toLowerCase()));
  const applicantName = application ? `${application.applicant.firstName} ${application.applicant.lastName}` : "";
  const initialValues = React.useMemo(
    () =>
      application
        ? {
            propertyId: application.property.id,
            statusId: application.status.id,
            annualIncomeCents: application.annualIncomeCents,
            requestedMoveInDate: application.requestedMoveInDate,
            applicant: application.applicant,
          }
        : undefined,
    [application],
  );

  return (
    <main className="flex-1">
      <section className="transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button asChild className="min-w-40" variant="secondary">
              <Link href="/applications">
                <ArrowLeft className="h-4 w-4" />
                Applications
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <EntityLifecycleControls
              archiveDescription={<>This will mark {application ? applicantName : "this application"} as archived.</>}
              cancelDeleteLabel="Keep Application"
              canArchive={hasPermission(currentUserQuery.data?.permissions, "applications", "archive")}
              canDelete={hasPermission(currentUserQuery.data?.permissions, "applications", "delete")}
              deleteDescription={
                <>
                  This permanently deletes {application ? applicantName : "this application"}&apos;s application. This
                  cannot be undone.
                </>
              }
              entityLabel="application"
              isArchived={Boolean(application?.archivedAt)}
              isAvailable={Boolean(application)}
              onArchive={() => apiClient.applications.archive.mutate({ id })}
              onArchiveSuccess={async () => {
                toast.success(entityArchivedMessage("Application", applicantName));
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.list }),
                ]);
                router.push("/applications");
              }}
              onDelete={() => apiClient.applications.delete.mutate({ id })}
              onDeleteSuccess={async () => {
                toast.success(entityDeletedMessage("Application", applicantName));
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.list }),
                ]);
                router.push("/applications");
              }}
              onReactivate={() => apiClient.applications.reactivate.mutate({ id })}
              onReactivateSuccess={async () => {
                toast.success(entityReactivatedMessage("Application", applicantName));
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.byId(id) }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.applications.list }),
                ]);
              }}
            />
            <Button
              className="min-w-10 sm:min-w-40"
              disabled={!application}
              onClick={() => setIsNotesOpen(true)}
              variant="secondary"
            >
              <StickyNote className="h-4 w-4" />
              <span className="hidden sm:inline">Notes</span>
            </Button>
            <Button
              className="min-w-10 sm:min-w-40"
              disabled={!application}
              onClick={() => setIsEditOpen(true)}
              variant="primary"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit Application</span>
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
                      {formatApplicantAddress(application.applicant) ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
                          <MapPin className="h-3.5 w-3.5" />
                          {formatApplicantAddress(application.applicant)}
                        </p>
                      ) : null}
                      <Link
                        className="mt-2 inline-block text-sm text-white/75 hover:underline"
                        href={getPropertyLink(application.property.id)}
                      >
                        {application.property.name}
                      </Link>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-5 lg:w-[36rem] lg:self-stretch lg:justify-between">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        className="min-w-40"
                        disabled={
                          !approvedStatus ||
                          updateApplicationStatus.isPending ||
                          application.status.id === approvedStatus.id
                        }
                        onClick={() => approvedStatus && updateApplicationStatus.mutate(approvedStatus.id)}
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        className="min-w-40"
                        disabled={
                          !deniedStatus ||
                          updateApplicationStatus.isPending ||
                          application.status.id === deniedStatus.id
                        }
                        onClick={() => deniedStatus && updateApplicationStatus.mutate(deniedStatus.id)}
                        variant="danger"
                      >
                        <X className="h-4 w-4" />
                        Deny
                      </Button>
                    </div>
                    <div className="grid w-full gap-3 sm:grid-cols-3">
                      <ApplicationHeroStat icon={BadgeCheck} label="Status" value={application.status.label} />
                      <ApplicationHeroStat
                        icon={CalendarDays}
                        label="Applied On"
                        value={formatDate(application.submittedOn)}
                      />
                      <ApplicationHeroStat
                        icon={CalendarCheck}
                        label="Requested Move In"
                        value={
                          application.requestedMoveInDate ? formatDateOnly(application.requestedMoveInDate) : "Not set"
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>
              <Card>
                <CardHeader>
                  <h2 className="font-semibold text-parcelis-charcoal">Applicant profile</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ApplicantProfileCard icon={Cake} label="Age">
                      {application.applicant.dateOfBirth ? (
                        <>
                          <p>{getAge(application.applicant.dateOfBirth)}</p>
                          <p className="mt-1 text-xs font-medium text-parcelis-gray">
                            Born {formatDateOnly(application.applicant.dateOfBirth)}
                          </p>
                        </>
                      ) : (
                        "Not reported"
                      )}
                    </ApplicantProfileCard>
                    <ApplicantProfileCard icon={BriefcaseBusiness} label="Employment">
                      {application.applicant.employment ?? "Not reported"}
                    </ApplicantProfileCard>
                    <ApplicantProfileCard icon={Banknote} label="Income reported">
                      {formatCurrency(application.annualIncomeCents)} annually
                    </ApplicantProfileCard>
                    <ApplicantProfileCard icon={Mail} label="Contact info">
                      <a
                        className="block w-fit max-w-full rounded-full border border-parcelis-border bg-white px-3 py-1.5 text-xs hover:bg-parcelis-porcelain dark:bg-parcelis-slate"
                        href={`mailto:${application.applicant.email}`}
                      >
                        {application.applicant.email}
                      </a>
                      <a
                        className="mt-2 block w-fit max-w-full rounded-full border border-parcelis-border bg-white px-3 py-1.5 text-xs hover:bg-parcelis-porcelain dark:bg-parcelis-slate"
                        href={application.applicant.phone ? `tel:${application.applicant.phone}` : undefined}
                      >
                        {application.applicant.phone ?? "Phone not reported"}
                      </a>
                    </ApplicantProfileCard>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div>
                      <h2 className="font-semibold text-parcelis-charcoal">Screening</h2>
                      <p className="mt-1 text-sm text-parcelis-gray">Applicant verification and screening results.</p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <ApplicantProfileCard icon={BadgeCheck} label="Resident Score">
                        Not available
                      </ApplicantProfileCard>
                      <ApplicantProfileCard icon={Banknote} label="Income Verification">
                        Not available
                      </ApplicantProfileCard>
                      <ApplicantProfileCard icon={FileText} label="Background Report">
                        Not available
                      </ApplicantProfileCard>
                      <ApplicantProfileCard icon={FileText} label="Eviction Report">
                        Not available
                      </ApplicantProfileCard>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h2 className="font-semibold text-parcelis-charcoal">Application details</h2>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <ApplicationDetail label="Property" value={application.property.name} />
                    <ApplicationDetail label="Status" value={application.status.label} />
                    <ApplicationDetail label="Submitted" value={formatDate(application.submittedOn)} />
                    <ApplicationDetail
                      label="Requested move-in"
                      value={
                        application.requestedMoveInDate ? formatDateOnly(application.requestedMoveInDate) : "Not set"
                      }
                    />
                  </CardContent>
                </Card>
              </div>
              <section className="mt-5">
                <div className="mt-4 flex flex-wrap gap-5">
                  <ApplicationReviewCard
                    description="Employment records and work history."
                    title="Employment History"
                  />
                  <ApplicationReviewCard description="Emergency contact details." title="Emergency Contact" />
                  <ApplicationReviewCard description="Prior residences and rental history." title="Rental History" />
                  <ApplicationReviewCard
                    description="Evictions and missed rent history."
                    title="Evictions and Missed Rent"
                  />
                  <ApplicationReviewCard description="Personal and landlord references." title="References" />
                  <ApplicationReviewCard description="Income documents and verification." title="Proof of Income" />
                  <ApplicationReviewCard
                    description="Authorization for a criminal background check."
                    title="Criminal Background Check Authorization"
                  />
                </div>
              </section>
            </>
          )}
        </div>
        {application ? (
          <ApplicationDrawer
            drawerTitle="Edit Application"
            error={updateApplication.error}
            initialValues={initialValues}
            isPending={updateApplication.isPending}
            onOpenChange={setIsEditOpen}
            onSubmit={(input) => updateApplication.mutate(input)}
            open={isEditOpen}
            properties={properties}
            statuses={statuses}
            submitLabel="Save Changes"
          />
        ) : null}
        <NotesDrawer
          onOpenChange={setIsNotesOpen}
          open={isNotesOpen}
          subject={{ applicationId: id }}
          subjectLabel={applicantName || "Application"}
        />
      </section>
    </main>
  );
}

function ApplicantProfileCard({
  children,
  icon: Icon,
  label,
}: {
  children: React.ReactNode;
  icon: typeof Cake;
  label: string;
}) {
  return (
    <section className="rounded-md border border-parcelis-border bg-parcelis-porcelain/50 p-4 dark:bg-parcelis-charcoal/55">
      <div className="flex items-center gap-2 text-sm font-medium text-parcelis-gray">
        <Icon className="h-4 w-4 text-parcelis-green" />
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-parcelis-charcoal">{children}</div>
    </section>
  );
}

function ApplicationDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-parcelis-gray">{label}</p>
      <p className="mt-1 font-semibold text-parcelis-charcoal">{value}</p>
    </div>
  );
}

function ApplicationReviewCard({ description, title }: { description: string; title: string }) {
  return (
    <Card className="w-full md:w-[calc((100%-1.25rem)/2)]">
      <CardHeader>
        <h3 className="font-semibold text-parcelis-charcoal">{title}</h3>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-parcelis-gray">{description}</p>
        <p className="mt-4 text-sm font-semibold text-parcelis-charcoal">Not available</p>
      </CardContent>
    </Card>
  );
}

function ApplicationHeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-white/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white/70">
        <Icon className="h-4 w-4 text-parcelis-green" />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
