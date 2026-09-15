"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  DoorOpen,
  FileText,
  Mail,
  Phone,
  Plus,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Calendar,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@parcelis/ui";
import { leasePropertyStepSchema, leaseTenantBillingStepSchema, type CreatePropertyInput } from "@parcelis/schemas";
import { apiClient, queryKeys } from "../../../../components/api-client";
import { LeaseCreationStepper, leaseCreationSteps } from "../../../../components/lease-creation-stepper";
import { LoadingState } from "../../../../components/loading-state";
import {
  initialPropertyFormState,
  PropertyDrawer,
  type PropertyFormState,
} from "../../../../components/property-drawer";
import { uploadPropertyImage } from "../../../../components/property-image-upload";
import { entityCreatedMessage } from "../../../../components/toast-messages";
import { TenantDrawer, initialTenantFormState, type TenantFormState } from "../../../../components/tenant-drawer";
import { uploadTenantImage } from "../../../../components/tenant-image-upload";

type LeaseDraft = {
  version: 4;
  currentStep: string;
  propertyId: number | null;
  unitId: number | null;
  tenantIds: number[];
  termType: "fixed" | "month_to_month";
  continueMonthToMonthAfterEnd: boolean;
  startsOn: string;
  endsOn: string;
  monthlyRentCents: number | null;
  securityDepositCents: number | null;
  rentDueDay: number;
  billingResponsibility: "joint" | "individual";
  allowPartialPayments: boolean;
  tenantAllocations: Array<{
    tenantId: number;
    rentShareCents: number;
    depositShareCents: number;
  }>;
};

const initialLeaseDraft: LeaseDraft = {
  version: 4,
  currentStep: leaseCreationSteps[0]?.id ?? "property",
  propertyId: null,
  unitId: null,
  tenantIds: [],
  termType: "fixed",
  continueMonthToMonthAfterEnd: false,
  startsOn: "",
  endsOn: "",
  monthlyRentCents: null,
  securityDepositCents: null,
  rentDueDay: 1,
  billingResponsibility: "joint",
  allowPartialPayments: true,
  tenantAllocations: [],
};

function getLeaseDraftStorageKey(organizationId: number) {
  return `parcelis:lease-creation-draft:${organizationId}`;
}

function isLeaseDraft(value: unknown): value is LeaseDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === 4 &&
    typeof draft.currentStep === "string" &&
    (typeof draft.propertyId === "number" || draft.propertyId === null) &&
    (typeof draft.unitId === "number" || draft.unitId === null) &&
    Array.isArray(draft.tenantIds) &&
    draft.tenantIds.every((tenantId) => typeof tenantId === "number") &&
    (draft.termType === "fixed" || draft.termType === "month_to_month") &&
    typeof draft.continueMonthToMonthAfterEnd === "boolean" &&
    typeof draft.startsOn === "string" &&
    typeof draft.endsOn === "string" &&
    (typeof draft.monthlyRentCents === "number" || draft.monthlyRentCents === null) &&
    (typeof draft.securityDepositCents === "number" || draft.securityDepositCents === null) &&
    typeof draft.rentDueDay === "number" &&
    (draft.billingResponsibility === "joint" || draft.billingResponsibility === "individual") &&
    typeof draft.allowPartialPayments === "boolean" &&
    Array.isArray(draft.tenantAllocations) &&
    draft.tenantAllocations.every(
      (allocation) =>
        typeof allocation === "object" &&
        allocation !== null &&
        typeof (allocation as Record<string, unknown>).tenantId === "number" &&
        typeof (allocation as Record<string, unknown>).rentShareCents === "number" &&
        typeof (allocation as Record<string, unknown>).depositShareCents === "number",
    )
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatCurrencyInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function parseCurrencyInput(value: string) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function parseDateInput(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatPercentage(cents: number, totalCents: number | null) {
  if (!totalCents) return "0";
  return ((cents / totalCents) * 100).toFixed(2);
}

function parsePercentageInput(value: string, totalCents: number | null) {
  if (!value || !totalCents) return 0;
  const percentage = Number(value);
  return Number.isFinite(percentage) && percentage >= 0 ? Math.round((percentage / 100) * totalCents) : 0;
}

function splitCentsEvenly(totalCents: number | null, count: number) {
  if (!totalCents || count === 0) return Array.from({ length: count }, () => 0);
  const baseShareCents = Math.floor(totalCents / count);
  const remainderCents = totalCents % count;

  return Array.from({ length: count }, (_, index) => baseShareCents + (index < remainderCents ? 1 : 0));
}

function createEqualTenantAllocations(
  tenantIds: number[],
  monthlyRentCents: number | null,
  securityDepositCents: number | null,
): LeaseDraft["tenantAllocations"] {
  const rentShares = splitCentsEvenly(monthlyRentCents, tenantIds.length);
  const depositShares = splitCentsEvenly(securityDepositCents, tenantIds.length);

  return tenantIds.map((tenantId, index) => ({
    tenantId,
    rentShareCents: rentShares[index] ?? 0,
    depositShareCents: depositShares[index] ?? 0,
  }));
}

function synchronizeTenantAllocations(tenantIds: number[], allocations: LeaseDraft["tenantAllocations"]) {
  const allocationsByTenantId = new Map(allocations.map((allocation) => [allocation.tenantId, allocation]));

  return tenantIds.map(
    (tenantId) =>
      allocationsByTenantId.get(tenantId) ?? {
        tenantId,
        rentShareCents: 0,
        depositShareCents: 0,
      },
  );
}

function PropertySelector({
  onAddProperty,
  onValueChange,
  error,
  value,
}: {
  error: string | null;
  onAddProperty: () => void;
  onValueChange: (selection: { propertyId: number; unitId: number; monthlyRentCents: number }) => void;
  value: number | null;
}) {
  const [expandedPropertyIds, setExpandedPropertyIds] = React.useState<Set<number>>(() => new Set());
  const [availabilityFilter, setAvailabilityFilter] = React.useState<"available" | "all">("available");
  const [groupByProperty, setGroupByProperty] = React.useState(true);
  const propertiesQuery = useQuery({
    queryKey: queryKeys.properties.list,
    queryFn: () => apiClient.properties.list.query(),
  });

  if (propertiesQuery.isLoading) return <LoadingState label="Loading available properties" />;
  if (propertiesQuery.error) {
    return <div className="p-6 text-sm font-medium text-red-700">{propertiesQuery.error.message}</div>;
  }

  const propertyGroups = (propertiesQuery.data ?? []).flatMap((property) => {
    if (property.status === "archived") return [];
    const unavailableUnitNames = new Set(
      property.leases
        .filter((lease) => lease.status === "active" || lease.status === "notice")
        .map((lease) => lease.unitLabel),
    );
    const units = property.units
      .filter((unit) => !unit.archivedAt)
      .map((unit) => ({ ...unit, isAvailable: !unavailableUnitNames.has(unit.name) }))
      .filter((unit) => availabilityFilter === "all" || unit.isAvailable);
    return units.length > 0 ? [{ property, units }] : [];
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
    <div className="w-full text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-parcelis-border px-5 py-4">
        <div className="flex items-center gap-2">
          <ToggleGroup
            aria-label="Property availability"
            onValueChange={(nextValue) => setAvailabilityFilter(nextValue as "available" | "all")}
            value={availabilityFilter}
          >
            <ToggleGroupItem value="available">Available</ToggleGroupItem>
            <ToggleGroupItem value="all">All Properties</ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={() => setGroupByProperty((current) => !current)} type="button" variant="secondary">
            {groupByProperty ? "Grouped By Property" : "Not Grouped"}
          </Button>
        </div>
        <Button onClick={onAddProperty} type="button">
          <Plus className="h-4 w-4" />
          Add Property
        </Button>
      </div>
      {error ? (
        <Alert className="rounded-none border-x-0" variant="destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {propertyGroups.length === 0 ? (
        <div className="p-6 text-sm text-parcelis-gray">
          {availabilityFilter === "available" ? "No available properties were found." : "No properties were found."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[720px] border-collapse">
            <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
              <TableRow className="border-0">
                <TableHead className="w-1/2 px-5 py-3 font-semibold">Property / Unit</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Address</TableHead>
                <TableHead className="px-5 py-3 text-right font-semibold">Monthly Rent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupByProperty
                ? propertyGroups.map(({ property, units }) => {
                    const isExpanded = expandedPropertyIds.has(property.id);
                    const rents = units.map((unit) => unit.marketRateCents);
                    const minimumRent = Math.min(...rents);
                    const maximumRent = Math.max(...rents);
                    const availableUnitCount = units.filter((unit) => unit.isAvailable).length;
                    return (
                      <React.Fragment key={property.id}>
                        <TableRow
                          className="cursor-pointer border-t border-parcelis-border transition-colors hover:bg-parcelis-porcelain/60"
                          onClick={() => toggleProperty(property.id)}
                        >
                          <TableCell className="px-5 py-4">
                            <div className="flex items-center gap-4">
                              <button
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? "Collapse" : "Expand"} ${property.name} units`}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-parcelis-border text-parcelis-gray hover:bg-white"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleProperty(property.id);
                                }}
                                type="button"
                              >
                                <ChevronRight
                                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                />
                              </button>
                              <span className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-parcelis-porcelain text-parcelis-charcoal">
                                {property.imageUrl ? (
                                  <Image
                                    alt={`${property.name} property`}
                                    className="object-cover"
                                    fill
                                    sizes="80px"
                                    src={property.imageUrl}
                                    unoptimized
                                  />
                                ) : (
                                  <Building2 className="h-5 w-5" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold text-parcelis-charcoal">{property.name}</span>
                                <span className="block text-sm text-parcelis-gray">
                                  {availabilityFilter === "all"
                                    ? `${availableUnitCount} of ${units.length} available`
                                    : `${units.length} available ${units.length === 1 ? "unit" : "units"}`}
                                </span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-72 whitespace-normal px-5 py-4 text-parcelis-gray">
                            {property.line1}
                            {property.line2 ? `, ${property.line2}` : ""}, {property.city}, {property.region}{" "}
                            {property.postalCode}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                            {minimumRent === maximumRent
                              ? formatCurrency(minimumRent)
                              : `${formatCurrency(minimumRent)}–${formatCurrency(maximumRent)}`}
                          </TableCell>
                        </TableRow>
                        {isExpanded
                          ? units.map((unit) => {
                              const isSelected = value === unit.id;
                              return (
                                <TableRow
                                  aria-selected={isSelected}
                                  className={`border-t border-parcelis-border transition-colors ${
                                    unit.isAvailable ? "cursor-pointer hover:bg-parcelis-porcelain/80" : "opacity-60"
                                  } ${isSelected ? "bg-parcelis-green/10" : "bg-parcelis-porcelain/45"}`}
                                  key={unit.id}
                                  onClick={() => {
                                    if (unit.isAvailable) {
                                      onValueChange({
                                        propertyId: property.id,
                                        unitId: unit.id,
                                        monthlyRentCents: unit.marketRateCents,
                                      });
                                    }
                                  }}
                                >
                                  <TableCell className="px-5 py-3">
                                    <label
                                      className={`flex items-center gap-3 pl-12 ${
                                        unit.isAvailable ? "cursor-pointer" : "cursor-not-allowed"
                                      }`}
                                    >
                                      <input
                                        checked={isSelected}
                                        className="h-4 w-4 accent-parcelis-green"
                                        disabled={!unit.isAvailable}
                                        name="lease-unit"
                                        onChange={() =>
                                          onValueChange({
                                            propertyId: property.id,
                                            unitId: unit.id,
                                            monthlyRentCents: unit.marketRateCents,
                                          })
                                        }
                                        type="radio"
                                        value={unit.id}
                                      />
                                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-parcelis-charcoal">
                                        <DoorOpen className="h-4 w-4" />
                                      </span>
                                      <span>
                                        <span className="block font-semibold text-parcelis-charcoal">
                                          Unit {unit.name}
                                        </span>
                                        {!unit.isAvailable ? (
                                          <span className="block text-xs text-parcelis-gray">Unavailable</span>
                                        ) : null}
                                      </span>
                                    </label>
                                  </TableCell>
                                  <TableCell className="max-w-72 whitespace-normal px-5 py-3 text-parcelis-gray">
                                    {property.line1}
                                    {property.line2 ? `, ${property.line2}` : ""}, {property.city}, {property.region}{" "}
                                    {property.postalCode}
                                  </TableCell>
                                  <TableCell className="px-5 py-3 text-right font-semibold text-parcelis-charcoal">
                                    {formatCurrency(unit.marketRateCents)}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          : null}
                      </React.Fragment>
                    );
                  })
                : propertyGroups.flatMap(({ property, units }) =>
                    units.map((unit) => {
                      const isSelected = value === unit.id;
                      return (
                        <TableRow
                          aria-selected={isSelected}
                          className={`border-t border-parcelis-border transition-colors ${
                            unit.isAvailable ? "cursor-pointer hover:bg-parcelis-porcelain/60" : "opacity-60"
                          } ${isSelected ? "bg-parcelis-green/10" : ""}`}
                          key={unit.id}
                          onClick={() => {
                            if (unit.isAvailable) {
                              onValueChange({
                                propertyId: property.id,
                                unitId: unit.id,
                                monthlyRentCents: unit.marketRateCents,
                              });
                            }
                          }}
                        >
                          <TableCell className="px-5 py-4">
                            <label
                              className={`flex items-center gap-4 ${unit.isAvailable ? "cursor-pointer" : "cursor-not-allowed"}`}
                            >
                              <input
                                checked={isSelected}
                                className="h-4 w-4 accent-parcelis-green"
                                disabled={!unit.isAvailable}
                                name="lease-unit"
                                onChange={() =>
                                  onValueChange({
                                    propertyId: property.id,
                                    unitId: unit.id,
                                    monthlyRentCents: unit.marketRateCents,
                                  })
                                }
                                type="radio"
                                value={unit.id}
                              />
                              <span className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-parcelis-porcelain text-parcelis-charcoal">
                                {property.imageUrl ? (
                                  <Image
                                    alt={`${property.name} property`}
                                    className="object-cover"
                                    fill
                                    sizes="80px"
                                    src={property.imageUrl}
                                    unoptimized
                                  />
                                ) : (
                                  <Building2 className="h-5 w-5" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-semibold text-parcelis-charcoal">{property.name}</span>
                                <span className="block text-sm text-parcelis-gray">
                                  Unit {unit.name}
                                  {unit.isAvailable ? "" : " · Unavailable"}
                                </span>
                              </span>
                            </label>
                          </TableCell>
                          <TableCell className="max-w-72 whitespace-normal px-5 py-4 text-parcelis-gray">
                            {property.line1}
                            {property.line2 ? `, ${property.line2}` : ""}, {property.city}, {property.region}{" "}
                            {property.postalCode}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-right font-semibold text-parcelis-charcoal">
                            {formatCurrency(unit.marketRateCents)}
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ResidentsSelector({
  allowPartialPayments,
  billingResponsibility,
  error,
  onAddTenant,
  onAllowPartialPaymentsChange,
  onBillingResponsibilityChange,
  onMonthlyRentCentsChange,
  onSecurityDepositCentsChange,
  onTenantAllocationsChange,
  onValueChange,
  monthlyRentCents,
  securityDepositCents,
  tenantAllocations,
  value,
}: {
  allowPartialPayments: boolean;
  billingResponsibility: LeaseDraft["billingResponsibility"];
  error?: string | null;
  onAddTenant: () => void;
  onAllowPartialPaymentsChange: (allowPartialPayments: boolean) => void;
  onBillingResponsibilityChange: (billingResponsibility: LeaseDraft["billingResponsibility"]) => void;
  onMonthlyRentCentsChange: (monthlyRentCents: number | null) => void;
  onSecurityDepositCentsChange: (securityDepositCents: number | null) => void;
  onTenantAllocationsChange: (tenantAllocations: LeaseDraft["tenantAllocations"]) => void;
  onValueChange: (tenantIds: number[]) => void;
  monthlyRentCents: number | null;
  securityDepositCents: number | null;
  tenantAllocations: LeaseDraft["tenantAllocations"];
  value: number[];
}) {
  const [search, setSearch] = React.useState("");
  const [availabilityFilter, setAvailabilityFilter] = React.useState<"available" | "all">("available");
  const [rentAllocationMode, setRentAllocationMode] = React.useState<"percentage" | "amount">("percentage");
  const [depositAllocationMode, setDepositAllocationMode] = React.useState<"percentage" | "amount">("percentage");
  const [allocationInputs, setAllocationInputs] = React.useState<Record<string, string>>({});
  const [monthlyRentInput, setMonthlyRentInput] = React.useState(() => formatCurrencyInput(monthlyRentCents));
  const [securityDepositInput, setSecurityDepositInput] = React.useState(() =>
    formatCurrencyInput(securityDepositCents),
  );
  const tenantsQuery = useQuery({
    queryKey: queryKeys.tenants.list,
    queryFn: () => apiClient.tenants.list.query(),
  });

  React.useEffect(() => {
    setMonthlyRentInput(formatCurrencyInput(monthlyRentCents));
  }, [monthlyRentCents]);

  React.useEffect(() => {
    setSecurityDepositInput(formatCurrencyInput(securityDepositCents));
  }, [securityDepositCents]);

  const tenants = (tenantsQuery.data ?? []).filter((tenant) => tenant.tenantStatus !== "archived");
  const query = search.trim().toLowerCase();
  const filteredTenants = tenants
    .filter((tenant) =>
      [tenant.firstName, tenant.lastName, tenant.email, tenant.phone ?? ""].some((field) =>
        field.toLowerCase().includes(query),
      ),
    )
    .filter(
      (tenant) =>
        availabilityFilter === "all" ||
        value.includes(tenant.id) ||
        !tenant.leases.some((lease) => lease.status === "active" || lease.status === "notice"),
    );
  const selectedTenants = tenants.filter((tenant) => value.includes(tenant.id));
  const selectedAllocations = synchronizeTenantAllocations(value, tenantAllocations);
  const displayedAllocations =
    billingResponsibility === "joint"
      ? createEqualTenantAllocations(value, monthlyRentCents, securityDepositCents)
      : selectedAllocations;
  const allocatedRentCents = displayedAllocations.reduce((total, allocation) => total + allocation.rentShareCents, 0);
  const allocatedDepositCents = displayedAllocations.reduce(
    (total, allocation) => total + allocation.depositShareCents,
    0,
  );
  const billingValidationMessages = [
    ...(monthlyRentCents === null || monthlyRentCents <= 0 ? ["Enter a monthly rent amount greater than $0."] : []),
    ...(securityDepositCents === null ? ["Enter the security deposit amount."] : []),
    ...(billingResponsibility === "individual" && monthlyRentCents !== null && allocatedRentCents !== monthlyRentCents
      ? [
          `Rent allocations total ${formatCurrency(allocatedRentCents)}; ${formatCurrency(
            monthlyRentCents,
          )} is required.`,
        ]
      : []),
    ...(billingResponsibility === "individual" &&
    securityDepositCents !== null &&
    allocatedDepositCents !== securityDepositCents
      ? [
          `Deposit allocations total ${formatCurrency(allocatedDepositCents)}; ${formatCurrency(
            securityDepositCents,
          )} is required.`,
        ]
      : []),
  ];

  function toggleResidentSelection(tenantId: number) {
    onValueChange(value.includes(tenantId) ? value.filter((id) => id !== tenantId) : [...value, tenantId]);
  }

  function updateTenantAllocation(
    tenantId: number,
    field: "rentShareCents" | "depositShareCents",
    inputValue: string,
    mode: "percentage" | "amount",
  ) {
    const totalCents = field === "rentShareCents" ? monthlyRentCents : securityDepositCents;
    const shareCents =
      mode === "percentage" ? parsePercentageInput(inputValue, totalCents) : (parseCurrencyInput(inputValue) ?? 0);

    onTenantAllocationsChange(
      synchronizeTenantAllocations(value, tenantAllocations).map((allocation) =>
        allocation.tenantId === tenantId ? { ...allocation, [field]: shareCents } : allocation,
      ),
    );
  }

  if (tenantsQuery.isLoading) return <LoadingState label="Loading tenants" />;
  if (tenantsQuery.error) {
    return <div className="p-6 text-sm font-medium text-red-700">{tenantsQuery.error.message}</div>;
  }

  return (
    <div className="w-full text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-parcelis-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            aria-label="Tenant availability"
            onValueChange={(nextValue) => setAvailabilityFilter(nextValue as "available" | "all")}
            value={availabilityFilter}
          >
            <ToggleGroupItem value="available">Available</ToggleGroupItem>
            <ToggleGroupItem value="all">All Tenants</ToggleGroupItem>
          </ToggleGroup>
          <label className="flex h-10 items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 text-sm text-parcelis-gray md:min-w-80">
            <Search className="h-4 w-4" />
            <Input
              aria-label="Search tenants"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 focus:border-transparent"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tenants"
              value={search}
            />
          </label>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-sm font-semibold text-parcelis-charcoal">
            {value.length} {value.length === 1 ? "resident" : "residents"} selected
          </span>
          <Button onClick={onAddTenant} type="button">
            <Plus className="h-4 w-4" />
            Add Tenant
          </Button>
        </div>
      </div>
      {error && value.length === 0 ? (
        <Alert className="rounded-none border-x-0" variant="destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {filteredTenants.length === 0 ? (
        <div className="p-6 text-sm text-parcelis-gray">
          {tenants.length === 0
            ? "No tenants yet."
            : availabilityFilter === "available" && !query
              ? "No available tenants were found."
              : "No tenants match your search."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[860px] border-collapse">
            <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
              <TableRow className="border-0">
                <TableHead className="w-16 px-5 py-3 font-semibold">Select</TableHead>
                <TableHead className="w-72 px-5 py-3 font-semibold">Tenant</TableHead>
                <TableHead className="w-72 px-5 py-3 font-semibold">Contact</TableHead>
                <TableHead className="px-5 py-3 font-semibold">Current Lease</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants.map((tenant) => {
                const isSelected = value.includes(tenant.id);
                const currentLease = tenant.leases.find(
                  (lease) => lease.status === "active" || lease.status === "notice",
                );
                return (
                  <TableRow
                    aria-selected={isSelected}
                    className={`border-t border-parcelis-border ${
                      isSelected ? "bg-parcelis-green/10" : "hover:bg-parcelis-porcelain/60"
                    }`}
                    key={tenant.id}
                  >
                    <TableCell className="px-5 py-4">
                      <Checkbox
                        aria-label={`Select ${tenant.firstName} ${tenant.lastName}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleResidentSelection(tenant.id)}
                      />
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-parcelis-porcelain text-parcelis-green">
                          {tenant.imageUrl ? (
                            <Image
                              alt={`${tenant.firstName} ${tenant.lastName}`}
                              className="object-cover"
                              fill
                              sizes="40px"
                              src={tenant.imageUrl}
                              unoptimized
                            />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </span>
                        <span className="font-semibold text-parcelis-charcoal">
                          {tenant.firstName} {tenant.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-parcelis-green" />
                        {tenant.email}
                      </span>
                      {tenant.phone ? (
                        <span className="mt-1 flex items-center gap-2">
                          <Phone className="h-4 w-4 text-parcelis-green" />
                          {tenant.phone}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-parcelis-gray">
                      {currentLease ? (
                        <>
                          <span className="block font-medium text-parcelis-charcoal">{currentLease.property.name}</span>
                          <span>Unit {currentLease.unitLabel}</span>
                        </>
                      ) : (
                        "No current lease"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <section className="border-t border-parcelis-border px-5 py-8 md:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-parcelis-green">Resident billing</p>
        <div className="mt-5 flex flex-col gap-8 xl:flex-row xl:gap-10">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 sm:flex-row">
              <label className="flex flex-1 flex-col gap-2 text-sm font-semibold text-parcelis-charcoal">
                Monthly rent
                <Input
                  inputMode="decimal"
                  onBlur={() => onMonthlyRentCentsChange(parseCurrencyInput(monthlyRentInput))}
                  onChange={(event) => setMonthlyRentInput(event.target.value)}
                  placeholder="0.00"
                  type="text"
                  value={monthlyRentInput}
                />
              </label>
              <label className="flex flex-1 flex-col gap-2 text-sm font-semibold text-parcelis-charcoal">
                Security deposit
                <Input
                  inputMode="decimal"
                  onBlur={() => onSecurityDepositCentsChange(parseCurrencyInput(securityDepositInput))}
                  onChange={(event) => setSecurityDepositInput(event.target.value)}
                  placeholder="0.00"
                  type="text"
                  value={securityDepositInput}
                />
              </label>
            </div>

            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-parcelis-charcoal">Tenant allocations</h2>
                  <p className="mt-2 text-sm leading-6 text-parcelis-gray">
                    {billingResponsibility === "individual"
                      ? "Set each tenant’s rent and deposit share."
                      : "All selected tenants share a single invoice and balance."}
                  </p>
                </div>
                {billingResponsibility === "individual" && selectedTenants.length > 0 ? (
                  <Button
                    onClick={() =>
                      onTenantAllocationsChange(
                        createEqualTenantAllocations(value, monthlyRentCents, securityDepositCents),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Reset to equal shares
                  </Button>
                ) : null}
              </div>

              {selectedTenants.length > 0 ? (
                <div className="mt-5 overflow-x-auto rounded-md border border-parcelis-border bg-white">
                  <Table className="min-w-[620px] border-collapse">
                    <TableHeader className="bg-parcelis-porcelain text-xs uppercase text-parcelis-gray">
                      <TableRow className="border-0">
                        <TableHead className="px-4 py-3 font-semibold">Tenant</TableHead>
                        <TableHead className="px-4 py-3 font-semibold">
                          <span className="flex items-center justify-between gap-3">
                            Rent
                            <ToggleGroup
                              aria-label="Rent allocation input mode"
                              onValueChange={(nextValue) => setRentAllocationMode(nextValue as "percentage" | "amount")}
                              value={rentAllocationMode}
                            >
                              <ToggleGroupItem value="percentage">%</ToggleGroupItem>
                              <ToggleGroupItem value="amount">$</ToggleGroupItem>
                            </ToggleGroup>
                          </span>
                        </TableHead>
                        <TableHead className="px-4 py-3 font-semibold">
                          <span className="flex items-center justify-between gap-3">
                            Deposit
                            <ToggleGroup
                              aria-label="Deposit allocation input mode"
                              onValueChange={(nextValue) =>
                                setDepositAllocationMode(nextValue as "percentage" | "amount")
                              }
                              value={depositAllocationMode}
                            >
                              <ToggleGroupItem value="percentage">%</ToggleGroupItem>
                              <ToggleGroupItem value="amount">$</ToggleGroupItem>
                            </ToggleGroup>
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTenants.map((tenant) => {
                        const allocation = displayedAllocations.find((item) => item.tenantId === tenant.id)!;
                        const rentInputKey = `${tenant.id}:rent:${rentAllocationMode}`;
                        const depositInputKey = `${tenant.id}:deposit:${depositAllocationMode}`;
                        const rentInputValue =
                          allocationInputs[rentInputKey] ??
                          (rentAllocationMode === "percentage"
                            ? formatPercentage(allocation.rentShareCents, monthlyRentCents)
                            : formatCurrencyInput(allocation.rentShareCents));
                        const depositInputValue =
                          allocationInputs[depositInputKey] ??
                          (depositAllocationMode === "percentage"
                            ? formatPercentage(allocation.depositShareCents, securityDepositCents)
                            : formatCurrencyInput(allocation.depositShareCents));
                        return (
                          <TableRow key={tenant.id}>
                            <TableCell className="px-4 py-3 font-semibold text-parcelis-charcoal">
                              {tenant.firstName} {tenant.lastName}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {billingResponsibility === "individual" ? (
                                <Input
                                  inputMode="decimal"
                                  onBlur={() => {
                                    updateTenantAllocation(
                                      tenant.id,
                                      "rentShareCents",
                                      rentInputValue,
                                      rentAllocationMode,
                                    );
                                    setAllocationInputs((current) => {
                                      const { [rentInputKey]: _removed, ...remaining } = current;
                                      return remaining;
                                    });
                                  }}
                                  onChange={(event) =>
                                    setAllocationInputs((current) => ({
                                      ...current,
                                      [rentInputKey]: event.target.value,
                                    }))
                                  }
                                  type="text"
                                  value={rentInputValue}
                                />
                              ) : (
                                <span className="block py-2 font-semibold text-parcelis-charcoal">
                                  {rentAllocationMode === "percentage"
                                    ? `${formatPercentage(allocation.rentShareCents, monthlyRentCents)}%`
                                    : formatCurrency(allocation.rentShareCents)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {billingResponsibility === "individual" ? (
                                <Input
                                  inputMode="decimal"
                                  onBlur={() => {
                                    updateTenantAllocation(
                                      tenant.id,
                                      "depositShareCents",
                                      depositInputValue,
                                      depositAllocationMode,
                                    );
                                    setAllocationInputs((current) => {
                                      const { [depositInputKey]: _removed, ...remaining } = current;
                                      return remaining;
                                    });
                                  }}
                                  onChange={(event) =>
                                    setAllocationInputs((current) => ({
                                      ...current,
                                      [depositInputKey]: event.target.value,
                                    }))
                                  }
                                  type="text"
                                  value={depositInputValue}
                                />
                              ) : (
                                <span className="block py-2 font-semibold text-parcelis-charcoal">
                                  {depositAllocationMode === "percentage"
                                    ? `${formatPercentage(allocation.depositShareCents, securityDepositCents)}%`
                                    : formatCurrency(allocation.depositShareCents)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-parcelis-porcelain/60">
                        <TableCell className="px-4 py-3 font-semibold text-parcelis-charcoal">Total</TableCell>
                        <TableCell className="px-4 py-3 font-semibold text-parcelis-charcoal">
                          {rentAllocationMode === "percentage"
                            ? `${formatPercentage(allocatedRentCents, monthlyRentCents)}%`
                            : formatCurrency(allocatedRentCents)}
                        </TableCell>
                        <TableCell className="px-4 py-3 font-semibold text-parcelis-charcoal">
                          {depositAllocationMode === "percentage"
                            ? `${formatPercentage(allocatedDepositCents, securityDepositCents)}%`
                            : formatCurrency(allocatedDepositCents)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="mt-5 rounded-md border border-parcelis-border bg-white p-4 text-sm text-parcelis-gray">
                  Select at least one tenant to view allocations.
                </div>
              )}
              {billingValidationMessages.length > 0 ? (
                <Alert className="mt-4" variant="destructive">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <AlertTitle>Complete tenant billing</AlertTitle>
                    <AlertDescription className="mt-1">
                      <ul className="list-disc space-y-1 pl-4">
                        {billingValidationMessages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </div>
                </Alert>
              ) : null}
            </div>
          </div>

          <div className="xl:w-[30rem] xl:shrink-0 xl:border-l xl:border-parcelis-border xl:pl-10">
            <h2 className="text-xl font-bold text-parcelis-charcoal">Billing responsibility</h2>
            <RadioGroup
              className="mt-5 gap-5"
              onValueChange={(nextValue) => {
                if (nextValue === "joint" || nextValue === "individual") {
                  onBillingResponsibilityChange(nextValue);
                }
              }}
              value={billingResponsibility}
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-parcelis-porcelain">
                <RadioGroupItem className="mt-0.5" value="joint" />
                <span>
                  <span className="block font-semibold text-parcelis-charcoal">
                    All tenants are equally responsible.
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-parcelis-gray">
                    We’ll create one shared invoice. Every tenant can view the full amount and pay against the same
                    balance.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-parcelis-porcelain">
                <RadioGroupItem className="mt-0.5" value="individual" />
                <span>
                  <span className="block font-semibold text-parcelis-charcoal">
                    Each tenant is responsible for their own portion.
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-parcelis-gray">
                    We’ll create a separate invoice for each tenant based on their rent and deposit allocation.
                  </span>
                </span>
              </label>
            </RadioGroup>

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-parcelis-border pt-6">
              <div>
                <h3 className="font-semibold text-parcelis-charcoal">Partial payments</h3>
                <p className="mt-1 text-sm leading-6 text-parcelis-gray">
                  Tenants may submit partial invoice payments.
                </p>
              </div>
              <Switch checked={allowPartialPayments} onCheckedChange={onAllowPartialPaymentsChange} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function LeaseTermsSelector({
  continueMonthToMonthAfterEnd,
  onContinueMonthToMonthAfterEndChange,
  endsOn,
  onEndsOnChange,
  onStartsOnChange,
  onTermTypeChange,
  startsOn,
  termType,
}: {
  continueMonthToMonthAfterEnd: boolean;
  onContinueMonthToMonthAfterEndChange: (continueMonthToMonthAfterEnd: boolean) => void;
  endsOn: string;
  onEndsOnChange: (endsOn: string) => void;
  onStartsOnChange: (startsOn: string) => void;
  onTermTypeChange: (termType: LeaseDraft["termType"]) => void;
  startsOn: string;
  termType: LeaseDraft["termType"];
}) {
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = React.useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = React.useState(false);
  const endDate = parseDateInput(endsOn);
  const today = new Date();
  const leaseEndMonth = new Date(today.getFullYear() + 7, today.getMonth(), 1);
  const startDate = parseDateInput(startsOn);

  return (
    <div className="flex flex-1 flex-col gap-6 p-5 md:p-6">
      <div>
        <h2 className="text-xl font-bold text-parcelis-charcoal">Lease terms</h2>
        <p className="mt-1 text-sm text-parcelis-gray">Choose how long this lease will run.</p>
      </div>

      <RadioGroup
        className="flex flex-col gap-3 md:flex-row"
        onValueChange={(value) => onTermTypeChange(value as LeaseDraft["termType"])}
        value={termType}
      >
        <label
          className={`flex flex-1 cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
            termType === "fixed"
              ? "border-parcelis-green bg-parcelis-green/10"
              : "border-parcelis-border hover:bg-parcelis-porcelain/60"
          }`}
        >
          <span
            className={`flex size-30 shrink-0 items-center justify-center rounded-md ${
              termType === "fixed" ? "bg-parcelis-green text-white" : "bg-parcelis-porcelain text-parcelis-gray"
            }`}
          >
            <CalendarRange className="size-25" />
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="font-semibold text-parcelis-charcoal">Fixed term</span>
            <span className="text-sm leading-5 text-parcelis-gray">This lease runs for a fixed term, starting on the date below and ending on the date below.</span>
          </span>
          <RadioGroupItem className="mt-1" value="fixed" />
        </label>
        <label
          className={`flex flex-1 cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
            termType === "month_to_month"
              ? "border-parcelis-green bg-parcelis-green/10"
              : "border-parcelis-border hover:bg-parcelis-porcelain/60"
          }`}
        >
          <span
            className={`flex size-30 shrink-0 items-center justify-center rounded-md ${
              termType === "month_to_month"
                ? "bg-parcelis-green text-white"
                : "bg-parcelis-porcelain text-parcelis-gray"
            }`}
          >
            <CalendarDays className="size-25" />
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="font-semibold text-parcelis-charcoal">Month-to-month</span>
            <span className="text-sm leading-5 text-parcelis-gray">This lease begins on the start date below and automatically renews on a month-to-month basis until terminated.</span>
          </span>
          <RadioGroupItem className="mt-1" value="month_to_month" />
        </label>
      </RadioGroup>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex w-full flex-col gap-2 md:max-w-sm">
          <label className="text-sm font-semibold text-parcelis-charcoal" htmlFor="lease-start-date">
            Lease start date
          </label>
        <Popover onOpenChange={setIsStartDatePickerOpen} open={isStartDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-describedby="lease-start-date-description"
              className="justify-start font-normal"
              id="lease-start-date"
              type="button"
              variant="secondary"
            >
              <CalendarDays className="size-4 text-parcelis-gray" />
              {startDate ? formatDateLabel(startDate) : "Select a start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              endMonth={leaseEndMonth}
              mode="single"
              onSelect={(date) => {
                if (!date) return;
                onStartsOnChange(formatDateInput(date));
                setIsStartDatePickerOpen(false);
              }}
              selected={startDate}
            />
          </PopoverContent>
        </Popover>
        <p className="text-sm text-parcelis-gray" id="lease-start-date-description">
          The first day of the lease term.
        </p>
      </div>

        {termType === "fixed" ? (
          <div className="flex w-full flex-col gap-2 md:max-w-sm">
          <label className="text-sm font-semibold text-parcelis-charcoal" htmlFor="lease-end-date">
            Lease end date
          </label>
          <Popover onOpenChange={setIsEndDatePickerOpen} open={isEndDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-describedby="lease-end-date-description"
                className="justify-start font-normal"
                id="lease-end-date"
                type="button"
                variant="secondary"
              >
                <CalendarDays className="size-4 text-parcelis-gray" />
                {endDate ? formatDateLabel(endDate) : "Select an end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                disabled={startDate ? { before: startDate } : undefined}
                endMonth={leaseEndMonth}
                mode="single"
                onSelect={(date) => {
                  if (!date) return;
                  onEndsOnChange(formatDateInput(date));
                  setIsEndDatePickerOpen(false);
                }}
                selected={endDate}
              />
            </PopoverContent>
          </Popover>
          <p className="text-sm text-parcelis-gray" id="lease-end-date-description">
            The last day of the lease term.
          </p>
          </div>
        ) : null}
      </div>
      {termType === "fixed" ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-parcelis-border p-4 hover:bg-parcelis-porcelain/60">
          <Checkbox
            checked={continueMonthToMonthAfterEnd}
            className="mt-0.5"
            onCheckedChange={(checked) => onContinueMonthToMonthAfterEndChange(checked === true)}
          />
          <span className="flex flex-col gap-1">
            <span className="font-semibold text-parcelis-charcoal">
              Continue month-to-month after the end date
            </span>
            <span className="text-sm leading-5 text-parcelis-gray">
              The lease will transition to a month-to-month arrangement once the fixed term ends.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

export default function NewLeasePage() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<LeaseDraft>(initialLeaseDraft);
  const [hydratedStorageKey, setHydratedStorageKey] = React.useState<string | null>(null);
  const activeOrganizationQuery = useQuery({
    queryKey: [...queryKeys.organizations.active, pathname],
    queryFn: () => apiClient.organizations.active.query(),
  });
  const storageKey = activeOrganizationQuery.data ? getLeaseDraftStorageKey(activeOrganizationQuery.data.id) : null;
  const [isPropertyDrawerOpen, setIsPropertyDrawerOpen] = React.useState(false);
  const [propertyForm, setPropertyForm] = React.useState<PropertyFormState>(initialPropertyFormState);
  const [propertyImageFile, setPropertyImageFile] = React.useState<File | null>(null);
  const [isTenantDrawerOpen, setIsTenantDrawerOpen] = React.useState(false);
  const [tenantForm, setTenantForm] = React.useState(initialTenantFormState);
  const [tenantImageFile, setTenantImageFile] = React.useState<File | null>(null);
  const [stepError, setStepError] = React.useState<string | null>(null);
  const createProperty = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: CreatePropertyInput }) => {
      const property = await apiClient.properties.create.mutate(input);
      if (imageFile) await uploadPropertyImage(property.id, imageFile);
      return property;
    },
    onSuccess: async (property) => {
      setPropertyForm(initialPropertyFormState);
      setPropertyImageFile(null);
      setIsPropertyDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties.list });
      toast.success(entityCreatedMessage("Property", property.name));
    },
  });
  const createTenant = useMutation({
    mutationFn: async ({ imageFile, input }: { imageFile: File | null; input: TenantFormState }) => {
      const tenant = await apiClient.tenants.create.mutate(input);
      if (imageFile) await uploadTenantImage(tenant.id, imageFile);
      return tenant;
    },
    onSuccess: async (tenant) => {
      setIsTenantDrawerOpen(false);
      setDraft((current) => {
        const tenantIds = current.tenantIds.includes(tenant.id) ? current.tenantIds : [...current.tenantIds, tenant.id];

        return {
          ...current,
          tenantIds,
          tenantAllocations: synchronizeTenantAllocations(tenantIds, current.tenantAllocations),
        };
      });
      setTenantForm(initialTenantFormState);
      setTenantImageFile(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.list });
      toast.success(entityCreatedMessage("Tenant", `${tenant.firstName} ${tenant.lastName}`));
    },
  });
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
    setStepError(null);
    const previousStep = leaseCreationSteps[currentIndex - 1];
    if (previousStep) setDraft((current) => ({ ...current, currentStep: previousStep.id }));
  }

  function validateCurrentStep() {
    const result =
      currentIndex === 0
        ? leasePropertyStepSchema.safeParse({
            propertyId: draft.propertyId,
            unitId: draft.unitId,
          })
        : currentIndex === 1
          ? leaseTenantBillingStepSchema.safeParse({
              tenantIds: draft.tenantIds,
              billingResponsibility: draft.billingResponsibility,
              allowPartialPayments: draft.allowPartialPayments,
              monthlyRentCents: draft.monthlyRentCents,
              securityDepositCents: draft.securityDepositCents,
              tenantAllocations: draft.tenantAllocations,
            })
          : null;

    if (!result) return true;

    if (result.success) {
      setStepError(null);
      return true;
    }

    const firstIssue = result.error.issues[0];
    setStepError(
      currentIndex === 1 && firstIssue?.path[0] !== "tenantIds"
        ? null
        : (firstIssue?.message ?? "Complete this step to continue."),
    );
    return false;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    const nextStep = leaseCreationSteps[currentIndex + 1];
    if (nextStep) setDraft((current) => ({ ...current, currentStep: nextStep.id }));
  }

  function handleStepChange(nextStepId: string) {
    const nextIndex = leaseCreationSteps.findIndex((step) => step.id === nextStepId);
    if (nextIndex === -1 || nextIndex === currentIndex) return;
    if (nextIndex > currentIndex + 1 || (nextIndex > currentIndex && !validateCurrentStep())) return;

    setStepError(null);
    setDraft((current) => ({ ...current, currentStep: nextStepId }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLastStep) goNext();
  }

  return (
    <>
      <PropertyDrawer
        drawerTitle="Add Property"
        error={createProperty.error}
        form={propertyForm}
        imageFile={propertyImageFile}
        isPending={createProperty.isPending}
        onFormChange={setPropertyForm}
        onImageChange={setPropertyImageFile}
        onOpenChange={(open) => {
          setIsPropertyDrawerOpen(open);
          if (!open) setPropertyImageFile(null);
        }}
        onSubmit={(input, imageFile) => createProperty.mutate({ imageFile, input })}
        open={isPropertyDrawerOpen}
      />
      <TenantDrawer
        drawerTitle="Add Tenant"
        error={createTenant.error}
        form={tenantForm}
        imageFile={tenantImageFile}
        isPending={createTenant.isPending}
        onFormChange={setTenantForm}
        onImageChange={setTenantImageFile}
        onOpenChange={(open) => {
          setIsTenantDrawerOpen(open);
          if (!open) setTenantImageFile(null);
        }}
        onSubmit={(input, imageFile) => createTenant.mutate({ imageFile, input })}
        open={isTenantDrawerOpen}
        submitLabel="Add Tenant"
      />
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

            <form className="flex flex-1 flex-col" onSubmit={handleSubmit}>
              {/* wizard stepper card for lease creation */}
              <Card className="flex flex-1 flex-col">
                <CardHeader className="border-b border-parcelis-border p-5 md:p-6">
                  <LeaseCreationStepper onValueChange={handleStepChange} value={draft.currentStep} />
                </CardHeader>
                <CardContent
                  className={`flex min-h-80 flex-1 flex-col ${
                    currentIndex <= 2 ? "p-0" : "items-center justify-center p-8 text-center"
                  }`}
                >
                  {currentIndex === 0 ? (
                    <PropertySelector
                      error={stepError}
                      onAddProperty={() => setIsPropertyDrawerOpen(true)}
                      onValueChange={({ propertyId, unitId, monthlyRentCents }) => {
                        setStepError(null);
                        setDraft((current) => ({
                          ...current,
                          propertyId,
                          unitId,
                          monthlyRentCents,
                        }));
                      }}
                      value={draft.unitId}
                    />
                  ) : currentIndex === 1 ? (
                    <ResidentsSelector
                      allowPartialPayments={draft.allowPartialPayments}
                      billingResponsibility={draft.billingResponsibility}
                      error={stepError}
                      monthlyRentCents={draft.monthlyRentCents}
                      onAddTenant={() => setIsTenantDrawerOpen(true)}
                      onAllowPartialPaymentsChange={(allowPartialPayments) =>
                        setDraft((current) => ({ ...current, allowPartialPayments }))
                      }
                      onBillingResponsibilityChange={(billingResponsibility) =>
                        setDraft((current) => ({
                          ...current,
                          billingResponsibility,
                          tenantAllocations:
                            billingResponsibility === "individual"
                              ? createEqualTenantAllocations(
                                  current.tenantIds,
                                  current.monthlyRentCents,
                                  current.securityDepositCents,
                                )
                              : [],
                        }))
                      }
                      onMonthlyRentCentsChange={(monthlyRentCents) =>
                        setDraft((current) => ({ ...current, monthlyRentCents }))
                      }
                      onSecurityDepositCentsChange={(securityDepositCents) =>
                        setDraft((current) => ({ ...current, securityDepositCents }))
                      }
                      onTenantAllocationsChange={(tenantAllocations) =>
                        setDraft((current) => ({ ...current, tenantAllocations }))
                      }
                      onValueChange={(tenantIds) => {
                        setStepError(null);
                        setDraft((current) => ({
                          ...current,
                          tenantIds,
                          tenantAllocations: synchronizeTenantAllocations(tenantIds, current.tenantAllocations),
                        }));
                      }}
                      securityDepositCents={draft.securityDepositCents}
                      tenantAllocations={draft.tenantAllocations}
                      value={draft.tenantIds}
                    />
                  ) : currentIndex === 2 ? (
                    <LeaseTermsSelector
                      continueMonthToMonthAfterEnd={draft.continueMonthToMonthAfterEnd}
                      endsOn={draft.endsOn}
                      onContinueMonthToMonthAfterEndChange={(continueMonthToMonthAfterEnd) =>
                        setDraft((current) => ({ ...current, continueMonthToMonthAfterEnd }))
                      }
                      onEndsOnChange={(endsOn) => setDraft((current) => ({ ...current, endsOn }))}
                      onStartsOnChange={(startsOn) =>
                        setDraft((current) => ({ ...current, startsOn }))
                      }
                      onTermTypeChange={(termType) =>
                        setDraft((current) => ({
                          ...current,
                          termType,
                          continueMonthToMonthAfterEnd:
                            termType === "fixed" ? current.continueMonthToMonthAfterEnd : false,
                          endsOn: termType === "fixed" ? current.endsOn : "",
                        }))
                      }
                      startsOn={draft.startsOn}
                      termType={draft.termType}
                    />
                  ) : (
                    <>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-parcelis-green">
                        Step {currentIndex + 1}
                      </p>
                      <h2 className="mt-3 text-2xl font-bold text-parcelis-charcoal">{step?.title}</h2>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-parcelis-gray">
                        {step?.description}. The lease form fields for this section will be added next.
                      </p>
                    </>
                  )}
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
                  <Button
                    className="min-w-40"
                    disabled={isLastStep || (currentIndex === 0 && draft.unitId === null)}
                    type="submit"
                  >
                    {isLastStep ? "Create lease" : "Next"}
                    {!isLastStep ? <ChevronRight className="h-4 w-4" /> : null}
                  </Button>
                </div>
              </Card>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
