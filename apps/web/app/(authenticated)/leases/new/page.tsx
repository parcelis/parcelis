"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader } from "@parcelis/ui";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LeaseCreationStepper, leaseCreationSteps } from "../../../../components/lease-creation-stepper";

// Types and initial state for the lease creation form.
type LeaseDraft = {
  version: 1;
  currentStep: string;
  propertyId: number | null;
  unitId: number | null;
  tenantIds: number[];
  startsOn: string;
  endsOn: string;
  monthlyRentCents: number | null;
  depositCents: number | null;
  billingDay: number | null;
};

// Initial state for the lease creation form.
const initialLeaseDraft: LeaseDraft = {
  version: 1,
  currentStep: leaseCreationSteps[0]?.id ?? "property",
  propertyId: null,
  unitId: null,
  tenantIds: [],
  startsOn: "",
  endsOn: "",
  monthlyRentCents: null,
  depositCents: null,
  billingDay: null,
};

function getLeaseDraftStorageKey(organizationId: number) {
  return `parcelis:lease-creation-draft:v1:${organizationId}`;
}

function isLeaseDraft(value: unknown): value is LeaseDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === 1 &&
    typeof draft.currentStep === "string" &&
    (typeof draft.propertyId === "number" || draft.propertyId === null) &&
    (typeof draft.unitId === "number" || draft.unitId === null) &&
    Array.isArray(draft.tenantIds) &&
    draft.tenantIds.every((tenantId) => typeof tenantId === "number") &&
    typeof draft.startsOn === "string" &&
    typeof draft.endsOn === "string" &&
    (typeof draft.monthlyRentCents === "number" || draft.monthlyRentCents === null) &&
    (typeof draft.depositCents === "number" || draft.depositCents === null) &&
    (typeof draft.billingDay === "number" || draft.billingDay === null)
  );
}

export default function NewLeasePage() {
  const pathname = usePathname();
  // State for the lease creation form.
  const [draft, setDraft] = React.useState<LeaseDraft>(initialLeaseDraft);
  const [hydratedStorageKey, setHydratedStorageKey] = React.useState<string | null>(null);
  const activeOrganizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const storageKey = activeOrganizationQuery.data ? getLeaseDraftStorageKey(activeOrganizationQuery.data.id) : null;
  // Determine the current step index and step details.
  const currentIndex = leaseCreationSteps.findIndex((step) => step.id === draft.currentStep);
  const step = leaseCreationSteps[currentIndex];
  const isLastStep = currentIndex === leaseCreationSteps.length - 1;

  React.useEffect(() => {
    if (!storageKey) return;

    try {
      const storedDraft = window.sessionStorage.getItem(storageKey);
      if (storedDraft) {
        const parsedDraft: unknown = JSON.parse(storedDraft);
        if (isLeaseDraft(parsedDraft)) setDraft(parsedDraft);
      }
    } catch {
      setDraft(initialLeaseDraft);
    }

    setHydratedStorageKey(storageKey);
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || hydratedStorageKey !== storageKey) return;

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Storage can be unavailable in private browsing or restricted browser contexts.
    }
  }, [draft, hydratedStorageKey, storageKey]);

  function goBack() {
    const previousStep = leaseCreationSteps[currentIndex - 1];
    if (previousStep) setDraft((current) => ({ ...current, currentStep: previousStep.id }));
  }

  function goNext() {
    const nextStep = leaseCreationSteps[currentIndex + 1];
    if (nextStep) setDraft((current) => ({ ...current, currentStep: nextStep.id }));
  }

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex flex-1 flex-col transition-[padding] duration-200 lg:pl-[var(--parcelis-sidebar-width)]">
        <header className="parcelis-mobile-nav-header sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-parcelis-border bg-white/90 px-4 backdrop-blur md:px-8">
          <Button asChild className="min-w-40" variant="secondary">
            <Link href="/leases">
              <ArrowLeft className="h-4 w-4" />
              Leases
            </Link>
          </Button>
          <span className="text-sm font-medium text-parcelis-gray">
            Step {currentIndex + 1} of {leaseCreationSteps.length}
          </span>
        </header>

        <div className="parcelis-page-shell flex flex-1 flex-col">
          <section className="mb-6 flex flex-col gap-4 rounded-lg bg-parcelis-charcoal p-6 text-white md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-parcelis-green">Leases</p>
              <h1 className="mt-4 text-3xl font-bold md:text-4xl">Create a lease</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                Set up the property, residents, terms, and billing details for a new lease.
              </p>
            </div>
            <div className="flex size-12 items-center justify-center rounded-md bg-white/10 text-parcelis-green">
              <FileText className="h-6 w-6" />
            </div>
          </section>

          <Card className="flex flex-1 flex-col">
            <CardHeader className="border-b border-parcelis-border p-5 md:p-6">
              <LeaseCreationStepper
                onValueChange={(currentStep) => setDraft((current) => ({ ...current, currentStep }))}
                value={draft.currentStep}
              />
            </CardHeader>
            <CardContent className="flex min-h-80 flex-1 flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-parcelis-green">
                Step {currentIndex + 1}
              </p>
              <h2 className="mt-3 text-2xl font-bold text-parcelis-charcoal">{step?.title}</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-parcelis-gray">
                {step?.description}. The lease form fields for this section will be added next.
              </p>
            </CardContent>
            <div className="flex items-center justify-between border-t border-parcelis-border p-4 md:px-6">
              {currentIndex === 0 ? (
                <Button asChild className="min-w-40" variant="secondary">
                  <Link href="/leases">Cancel</Link>
                </Button>
              ) : (
                <Button className="min-w-40" onClick={goBack} type="button" variant="secondary">
                  Back
                </Button>
              )}
              <Button className="min-w-40" disabled={isLastStep} onClick={goNext} type="button">
                {isLastStep ? "Create lease" : "Next"}
                {!isLastStep ? <ChevronRight className="h-4 w-4" /> : null}
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}
