"use client";

import * as React from "react";
import {
  AlignRight,
  Bath,
  BedDouble,
  Building2,
  ChevronDown,
  DoorOpen,
  Home,
  Loader2,
  Plus,
  Ruler,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FieldLabel,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
} from "@parcelis/ui";
import {
  propertyTypeValues,
  type CreatePropertyInput,
  type PropertyType,
} from "@parcelis/schemas";
import { useQuery } from "@tanstack/react-query";
import { apiClient, queryKeys } from "./api-client";
import { useShortcut, type ShortcutKey } from "./shortcut-provider";

export type PropertyFormState = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  propertyType: PropertyType;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddressLine1: string;
  contactAddressLine2: string;
  contactCity: string;
  contactRegion: string;
  contactPostalCode: string;
  unitCount: string;
};

export const initialPropertyFormState: PropertyFormState = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  propertyType: "Apartment",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  contactAddressLine1: "",
  contactAddressLine2: "",
  contactCity: "",
  contactRegion: "",
  contactPostalCode: "",
  unitCount: "",
};

type DrawerStep = "property" | "unit";
type UnitType = "Residential" | "Commercial";

export type UnitDetailsFormState = {
  id: string;
  unitName: string;
  marketRate: string;
  unitType: UnitType;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  rentIncludes: string[];
  amenities: string[];
};

function createUnitDetailsFormState(index = 0): UnitDetailsFormState {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${index}`,
    unitName: `Unit ${index + 1}`,
    marketRate: "",
    unitType: "Residential",
    bedrooms: "",
    bathrooms: "",
    squareFeet: "",
    rentIncludes: [],
    amenities: [],
  };
}

function getInitialUnitFormStates(initialUnits?: UnitDetailsFormState[]) {
  return initialUnits && initialUnits.length > 0
    ? initialUnits
    : [createUnitDetailsFormState()];
}

type PropertyDrawerProps = {
  cancelDescription?: string;
  drawerTitle?: string;
  error?: Error | null;
  form: PropertyFormState;
  initialFormState?: PropertyFormState;
  initialStep?: DrawerStep;
  initialUnits?: UnitDetailsFormState[];
  isPending: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<PropertyFormState>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreatePropertyInput) => void;
  open: boolean;
  submitLabel?: string;
  toggleShortcut?: ShortcutKey;
};

const steps = [
  { label: "Property Details", icon: Home, step: "property" },
  { label: "Unit Details", icon: DoorOpen, step: "unit" },
  { label: "Property Settings", icon: Settings, step: null },
] satisfies Array<{
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  step: DrawerStep | null;
}>;

export function PropertyDrawer({
  cancelDescription = "Are you sure you'd like to cancel?",
  drawerTitle = "Add Property",
  error,
  form,
  initialFormState = initialPropertyFormState,
  initialStep = "property",
  initialUnits,
  isPending,
  onFormChange,
  onOpenChange,
  onSubmit,
  open,
  submitLabel = "Create Property",
  toggleShortcut = "Mod+Shift+P",
}: PropertyDrawerProps) {
  const initialUnitStates = React.useMemo(
    () => getInitialUnitFormStates(initialUnits),
    [initialUnits],
  );
  const [currentStep, setCurrentStep] = React.useState<DrawerStep>(initialStep);
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = React.useState(false);
  const [isContactAddressPopoverOpen, setIsContactAddressPopoverOpen] =
    React.useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = React.useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState(false);
  const [unitPendingRemovalId, setUnitPendingRemovalId] = React.useState<
    string | null
  >(null);
  const [units, setUnits] = React.useState<UnitDetailsFormState[]>(() => [
    ...initialUnitStates,
  ]);
  const [expandedUnitIds, setExpandedUnitIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const unitOptionsQuery = useQuery({
    queryKey: queryKeys.unitOptions.list,
    queryFn: () => apiClient.unitOptions.list.query(),
  });
  const canContinueToUnitDetails = Boolean(
    form.name &&
    form.line1 &&
    form.city &&
    form.region &&
    form.postalCode &&
    form.propertyType &&
    form.unitCount,
  );
  const canSubmitUnitDetails =
    units.length > 0 &&
    units.every((unit) => unit.unitName && unit.marketRate && unit.unitType);
  const hasFormChanges = Object.entries(form).some(
    ([field, value]) =>
      value !== initialFormState[field as keyof PropertyFormState],
  );
  const hasUnitDetailsChanges =
    units.length !== initialUnitStates.length ||
    units.some((unit, index) => {
      const initialUnit = initialUnitStates[index];
      if (!initialUnit) {
        return true;
      }
      return Object.entries(unit).some(([field, value]) => {
        if (field === "id") {
          return false;
        }
        const initialValue = initialUnit[field as keyof UnitDetailsFormState];
        return Array.isArray(value) && Array.isArray(initialValue)
          ? value.length !== initialValue.length
          : value !== initialValue;
      });
    });
  const canSubmit =
    currentStep === "property"
      ? canContinueToUnitDetails
      : canSubmitUnitDetails;
  const primaryActionLabel = currentStep === "property" ? "Next" : submitLabel;
  const cityLine = [
    form.city,
    [form.region, form.postalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const addressLines = [form.line1, form.line2, cityLine].filter(Boolean);
  const contactCityLine = [
    form.contactCity,
    [form.contactRegion, form.contactPostalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const contactAddressLines = [
    form.contactAddressLine1,
    form.contactAddressLine2,
    contactCityLine,
  ].filter(Boolean);
  const contactAddress = contactAddressLines.join("\n");
  const rentIncludeOptions = unitOptionsQuery.data?.rentIncludes ?? [];
  const amenityOptions = unitOptionsQuery.data?.amenities ?? [];
  const unitPendingRemoval =
    units.find((unit) => unit.id === unitPendingRemovalId) ?? null;
  useShortcut("Mod+Enter", () => runPrimaryAction(), {
    enabled: open && canSubmit && !isPending,
  });
  useShortcut(
    toggleShortcut,
    () => {
      if (open) {
        closeAndReset();
      } else {
        onOpenChange(true);
      }
    },
    {
      enabled: !isDiscardDialogOpen,
    },
  );
  const previousOpenRef = React.useRef(open);
  React.useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = open;

    if (open && !wasOpen) {
      setCurrentStep(initialStep);
      setUnits([...initialUnitStates]);
      setExpandedUnitIds(new Set());
      setIsAddressPopoverOpen(false);
      setIsContactAddressPopoverOpen(false);
      setIsContactInfoOpen(false);
      setIsDiscardDialogOpen(false);
      setUnitPendingRemovalId(null);
      return;
    }

    if (open) {
      return;
    }

    setCurrentStep(initialStep);
    setUnits([...initialUnitStates]);
    setExpandedUnitIds(new Set());
    setIsAddressPopoverOpen(false);
    setIsContactAddressPopoverOpen(false);
    setIsContactInfoOpen(false);
    setIsDiscardDialogOpen(false);
    setUnitPendingRemovalId(null);
  }, [initialStep, initialUnitStates, open]);

  function updateField<Key extends keyof PropertyFormState>(
    field: Key,
    value: PropertyFormState[Key],
  ) {
    onFormChange((current) => ({ ...current, [field]: value }));
  }

  function updateUnitField<Key extends keyof UnitDetailsFormState>(
    unitId: string,
    field: Key,
    value: UnitDetailsFormState[Key],
  ) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId ? { ...unit, [field]: value } : unit,
      ),
    );
  }

  function updateUnitOption(
    unitId: string,
    field: "rentIncludes" | "amenities",
    optionId: string,
    checked: boolean,
  ) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              [field]: checked
                ? [...unit[field], optionId]
                : unit[field].filter((value) => value !== optionId),
            }
          : unit,
      ),
    );
  }

  function addUnit() {
    setUnits((current) => {
      const nextUnit = createUnitDetailsFormState(current.length);
      setExpandedUnitIds((expanded) => new Set(expanded).add(nextUnit.id));
      return [...current, nextUnit];
    });
  }

  function removeUnit(unitId: string) {
    setUnits((current) =>
      current.length > 1
        ? current.filter((unit) => unit.id !== unitId)
        : current,
    );
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      next.delete(unitId);
      return next;
    });
  }

  function confirmUnitRemoval() {
    if (!unitPendingRemovalId) {
      return;
    }

    removeUnit(unitPendingRemovalId);
    setUnitPendingRemovalId(null);
  }

  function toggleUnit(unitId: string) {
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  function parseOptionalInteger(value: string) {
    return value ? Number(value) : undefined;
  }

  function parseOptionalNumber(value: string) {
    return value ? Number(value) : undefined;
  }

  function parseMarketRateCents(value: string) {
    return Math.round(Number(value) * 100);
  }

  function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  function submitProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runPrimaryAction();
  }

  function runPrimaryAction() {
    if (currentStep === "property") {
      setCurrentStep("unit");
      setIsAddressPopoverOpen(false);
      setIsContactAddressPopoverOpen(false);
      return;
    }

    submitPropertyInput();
  }

  function submitPropertyInput() {
    onSubmit({
      name: form.name,
      propertyType: form.propertyType,
      contactName: form.contactName || undefined,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      contactAddress: contactAddress || undefined,
      address: {
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        region: form.region.toUpperCase(),
        postalCode: form.postalCode,
      },
      unitCount: Number(form.unitCount),
      units: units.map((unit) => ({
        id: isUuid(unit.id) ? unit.id : undefined,
        name: unit.unitName,
        marketRateCents: parseMarketRateCents(unit.marketRate),
        unitType: unit.unitType,
        bedrooms: parseOptionalInteger(unit.bedrooms),
        bathrooms: parseOptionalNumber(unit.bathrooms),
        squareFeet: parseOptionalInteger(unit.squareFeet),
        rentIncludeOptionIds: unit.rentIncludes,
        amenityOptionIds: unit.amenities,
      })),
    });
  }

  function closeAndReset() {
    if (hasFormChanges || hasUnitDetailsChanges) {
      setIsDiscardDialogOpen(true);
      return;
    }

    resetAndClose();
  }

  function resetAndClose() {
    setIsDiscardDialogOpen(false);
    setIsAddressPopoverOpen(false);
    setIsContactAddressPopoverOpen(false);
    setIsContactInfoOpen(false);
    setUnitPendingRemovalId(null);
    setCurrentStep(initialStep);
    setUnits([...initialUnitStates]);
    setExpandedUnitIds(new Set());
    onFormChange(initialFormState);
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          closeAndReset();
        }
      }}
    >
      <DrawerContent className="max-w-full sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
        <AlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Your changes will not be saved.
              </AlertDialogTitle>
              <AlertDialogDescription>
                {cancelDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsDiscardDialogOpen(false)}
              >
                Keep Editing
              </Button>
              <Button type="button" onClick={resetAndClose}>
                Cancel
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={Boolean(unitPendingRemoval)}
          onOpenChange={(nextOpen) =>
            !nextOpen && setUnitPendingRemovalId(null)
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Unit</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {unitPendingRemoval?.unitName || "this unit"}{" "}
                from the property if you continue.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setUnitPendingRemovalId(null)}
              >
                Keep Unit
              </Button>
              <Button type="button" onClick={confirmUnitRemoval}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={submitProperty}
        >
          <DrawerHeader className="flex items-center gap-3">
            <DrawerClose />
            <DrawerTitle>{drawerTitle}</DrawerTitle>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 py-5 md:px-6">
              <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)_8rem] md:items-center dark:bg-parcelis-slate">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">
                    {form.name || "Property Name"}
                  </p>
                  <div className="mt-1 space-y-0.5 text-sm font-medium text-white/70">
                    {addressLines.length > 0 ? (
                      addressLines.map((line, index) => (
                        <p className="truncate" key={`${line}-${index}`}>
                          {line}
                        </p>
                      ))
                    ) : (
                      <p>Property Address</p>
                    )}
                  </div>
                </div>
                <div className="border-white/15 md:border-l md:pl-8">
                  <p className="text-xs font-semibold uppercase text-white/55">
                    Units
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">
                    {form.unitCount || "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 px-4 py-6 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate lg:sticky lg:top-6 lg:self-start">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = step.step === currentStep;
                  const className = `flex w-full items-center gap-3 border-parcelis-border px-4 py-4 text-left ${
                    index > 0 ? "border-t" : ""
                  } ${isActive ? "bg-parcelis-porcelain/70 text-parcelis-charcoal dark:bg-parcelis-charcoal/55" : "text-parcelis-gray"}`;

                  if (!step.step) {
                    return (
                      <div className={className} key={step.label}>
                        <Icon className="h-5 w-5 text-parcelis-gray" />
                        <span className="text-sm font-semibold">
                          {step.label}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      className={`${className} transition hover:bg-parcelis-porcelain/70 hover:text-parcelis-charcoal`}
                      key={step.label}
                      onClick={() => setCurrentStep(step.step)}
                      type="button"
                    >
                      <Icon
                        className={`h-5 w-5 ${isActive ? "text-parcelis-green" : "text-parcelis-gray"}`}
                      />
                      <span className="text-sm font-semibold">
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </aside>

              <section>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">
                    {currentStep === "property"
                      ? "Property Details"
                      : "Unit Details"}
                  </h3>
                  {currentStep === "property" ? (
                    <>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1 md:col-span-2">
                          <FieldLabel>Property Address</FieldLabel>
                          <Popover
                            open={isAddressPopoverOpen}
                            onOpenChange={setIsAddressPopoverOpen}
                          >
                            <div className="relative">
                              <Input
                                className="pr-10"
                                onChange={(event) =>
                                  updateField("line1", event.target.value)
                                }
                                placeholder="123 Main Street"
                                required
                                value={form.line1}
                              />
                              <PopoverTrigger asChild>
                                <button
                                  aria-label="Show address details"
                                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                                  type="button"
                                >
                                  <AlignRight className="h-4 w-4" />
                                </button>
                              </PopoverTrigger>
                            </div>
                            <PopoverContent
                              align="end"
                              className="w-[min(calc(100vw-2rem),28rem)]"
                            >
                              <div className="grid gap-4 md:grid-cols-2">
                                <Label className="md:col-span-2">
                                  <FieldLabel>Address Line 1</FieldLabel>
                                  <Input
                                    onChange={(event) =>
                                      updateField("line1", event.target.value)
                                    }
                                    placeholder="123 Main Street"
                                    value={form.line1}
                                  />
                                </Label>
                                <Label className="md:col-span-2">
                                  <FieldLabel>Address Line 2</FieldLabel>
                                  <Input
                                    onChange={(event) =>
                                      updateField("line2", event.target.value)
                                    }
                                    placeholder="Suite 200"
                                    value={form.line2}
                                  />
                                </Label>
                                <Label className="md:col-span-2">
                                  <FieldLabel>City</FieldLabel>
                                  <Input
                                    onChange={(event) =>
                                      updateField("city", event.target.value)
                                    }
                                    value={form.city}
                                  />
                                </Label>
                                <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                                  <Label>
                                    <FieldLabel>State</FieldLabel>
                                    <Input
                                      className="uppercase"
                                      maxLength={2}
                                      onChange={(event) =>
                                        updateField(
                                          "region",
                                          event.target.value,
                                        )
                                      }
                                      value={form.region}
                                    />
                                  </Label>
                                  <Label>
                                    <FieldLabel>Postal Code</FieldLabel>
                                    <Input
                                      onChange={(event) =>
                                        updateField(
                                          "postalCode",
                                          event.target.value,
                                        )
                                      }
                                      value={form.postalCode}
                                    />
                                  </Label>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          {addressLines.length > 0 ? (
                            <div className="space-y-0.5 text-xs text-parcelis-gray">
                              {addressLines.map((line, index) => (
                                <p
                                  className="truncate"
                                  key={`${line}-${index}`}
                                >
                                  {line}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <Label className="md:col-span-2">
                          <FieldLabel>Name</FieldLabel>
                          <Input
                            onChange={(event) =>
                              updateField("name", event.target.value)
                            }
                            placeholder="Vine Street Lofts"
                            required
                            value={form.name}
                          />
                        </Label>

                        <Label>
                          <FieldLabel>Property Type</FieldLabel>
                          <Select
                            onChange={(event) =>
                              updateField(
                                "propertyType",
                                event.target.value as PropertyType,
                              )
                            }
                            required
                            value={form.propertyType}
                          >
                            {propertyTypeValues.map((propertyType) => (
                              <option key={propertyType} value={propertyType}>
                                {propertyType}
                              </option>
                            ))}
                          </Select>
                        </Label>

                        <Label>
                          <FieldLabel>Units</FieldLabel>
                          <Input
                            min={1}
                            onChange={(event) =>
                              updateField("unitCount", event.target.value)
                            }
                            required
                            type="number"
                            value={form.unitCount}
                          />
                        </Label>
                      </div>

                      <button
                        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-parcelis-charcoal hover:underline"
                        onClick={() =>
                          setIsContactInfoOpen((current) => !current)
                        }
                        type="button"
                      >
                        Property Contact Info
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isContactInfoOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {isContactInfoOpen ? (
                        <div className="mt-4 grid gap-4 rounded-md bg-parcelis-porcelain/70 p-4 dark:bg-parcelis-slate md:grid-cols-2">
                          <Label>
                            <FieldLabel>Contact Name</FieldLabel>
                            <Input
                              onChange={(event) =>
                                updateField("contactName", event.target.value)
                              }
                              value={form.contactName}
                            />
                          </Label>
                          <Label>
                            <FieldLabel>Contact Email</FieldLabel>
                            <Input
                              onChange={(event) =>
                                updateField("contactEmail", event.target.value)
                              }
                              type="email"
                              value={form.contactEmail}
                            />
                          </Label>
                          <Label>
                            <FieldLabel>Contact Phone</FieldLabel>
                            <Input
                              onChange={(event) =>
                                updateField("contactPhone", event.target.value)
                              }
                              type="tel"
                              value={form.contactPhone}
                            />
                          </Label>
                          <div className="grid gap-1 md:col-span-2">
                            <FieldLabel>Contact Address</FieldLabel>
                            <Popover
                              open={isContactAddressPopoverOpen}
                              onOpenChange={setIsContactAddressPopoverOpen}
                            >
                              <div className="relative">
                                <Input
                                  className="pr-10"
                                  onChange={(event) =>
                                    updateField(
                                      "contactAddressLine1",
                                      event.target.value,
                                    )
                                  }
                                  value={form.contactAddressLine1}
                                />
                                <PopoverTrigger asChild>
                                  <button
                                    aria-label="Show contact address details"
                                    className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                                    type="button"
                                  >
                                    <AlignRight className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                              </div>
                              <PopoverContent
                                align="end"
                                className="w-[min(calc(100vw-2rem),28rem)]"
                              >
                                <div className="grid gap-4 md:grid-cols-2">
                                  <Label className="md:col-span-2">
                                    <FieldLabel>Address Line 1</FieldLabel>
                                    <Input
                                      onChange={(event) =>
                                        updateField(
                                          "contactAddressLine1",
                                          event.target.value,
                                        )
                                      }
                                      value={form.contactAddressLine1}
                                    />
                                  </Label>
                                  <Label className="md:col-span-2">
                                    <FieldLabel>Address Line 2</FieldLabel>
                                    <Input
                                      onChange={(event) =>
                                        updateField(
                                          "contactAddressLine2",
                                          event.target.value,
                                        )
                                      }
                                      value={form.contactAddressLine2}
                                    />
                                  </Label>
                                  <Label className="md:col-span-2">
                                    <FieldLabel>City</FieldLabel>
                                    <Input
                                      onChange={(event) =>
                                        updateField(
                                          "contactCity",
                                          event.target.value,
                                        )
                                      }
                                      value={form.contactCity}
                                    />
                                  </Label>
                                  <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                                    <Label>
                                      <FieldLabel>State</FieldLabel>
                                      <Input
                                        className="uppercase"
                                        maxLength={2}
                                        onChange={(event) =>
                                          updateField(
                                            "contactRegion",
                                            event.target.value,
                                          )
                                        }
                                        value={form.contactRegion}
                                      />
                                    </Label>
                                    <Label>
                                      <FieldLabel>Postal Code</FieldLabel>
                                      <Input
                                        onChange={(event) =>
                                          updateField(
                                            "contactPostalCode",
                                            event.target.value,
                                          )
                                        }
                                        value={form.contactPostalCode}
                                      />
                                    </Label>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                            {contactAddressLines.length > 0 ? (
                              <div className="space-y-0.5 text-xs text-parcelis-gray">
                                {contactAddressLines.map((line, index) => (
                                  <p
                                    className="truncate"
                                    key={`${line}-${index}`}
                                  >
                                    {line}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-5 grid gap-5">
                      {units.map((unit) => {
                        const isExpanded = expandedUnitIds.has(unit.id);

                        return (
                          <div
                            className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate"
                            key={unit.id}
                          >
                            <div className="grid gap-4 border-b border-parcelis-border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                              <div className="grid gap-4 md:grid-cols-3">
                                <Label>
                                  <FieldLabel>Unit Name</FieldLabel>
                                  <Input
                                    onChange={(event) =>
                                      updateUnitField(
                                        unit.id,
                                        "unitName",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Unit 1A"
                                    required
                                    value={unit.unitName}
                                  />
                                </Label>
                                <Label>
                                  <FieldLabel>Market Rate</FieldLabel>
                                  <Input
                                    min={0}
                                    onChange={(event) =>
                                      updateUnitField(
                                        unit.id,
                                        "marketRate",
                                        event.target.value,
                                      )
                                    }
                                    required
                                    type="number"
                                    value={unit.marketRate}
                                  />
                                </Label>
                                <Label>
                                  <FieldLabel>Unit Type</FieldLabel>
                                  <Select
                                    onChange={(event) =>
                                      updateUnitField(
                                        unit.id,
                                        "unitType",
                                        event.target.value as UnitType,
                                      )
                                    }
                                    required
                                    value={unit.unitType}
                                  >
                                    <option value="Residential">
                                      Residential
                                    </option>
                                    <option value="Commercial">
                                      Commercial
                                    </option>
                                  </Select>
                                </Label>
                              </div>

                              <div className="flex items-start justify-end">
                                <button
                                  aria-label={`Remove ${unit.unitName || "unit"}`}
                                  className="inline-grid h-9 w-9 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={units.length === 1}
                                  onClick={() =>
                                    setUnitPendingRemovalId(unit.id)
                                  }
                                  type="button"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-4 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  className="inline-flex items-center gap-2 text-sm font-semibold text-parcelis-charcoal hover:underline"
                                  onClick={() => toggleUnit(unit.id)}
                                  type="button"
                                >
                                  <span>Unit Details</span>
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                </button>
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-parcelis-border bg-white px-2.5 py-1 text-xs font-semibold text-parcelis-charcoal dark:bg-parcelis-slate">
                                  <BedDouble className="h-4 w-4 text-parcelis-green" />
                                  {unit.bedrooms || "0"} bed
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-parcelis-border bg-white px-2.5 py-1 text-xs font-semibold text-parcelis-charcoal dark:bg-parcelis-slate">
                                  <Bath className="h-4 w-4 text-parcelis-green" />
                                  {unit.bathrooms || "0"} bath
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-parcelis-border bg-white px-2.5 py-1 text-xs font-semibold text-parcelis-charcoal dark:bg-parcelis-slate">
                                  <Ruler className="h-4 w-4 text-parcelis-green" />
                                  {unit.squareFeet || "0"} sq ft
                                </span>
                              </div>

                              {isExpanded ? (
                                <div className="grid gap-5">
                                  <div className="grid gap-4 md:grid-cols-3">
                                    <Label>
                                      <FieldLabel>Bedrooms</FieldLabel>
                                      <Input
                                        min={0}
                                        onChange={(event) =>
                                          updateUnitField(
                                            unit.id,
                                            "bedrooms",
                                            event.target.value,
                                          )
                                        }
                                        type="number"
                                        value={unit.bedrooms}
                                      />
                                    </Label>
                                    <Label>
                                      <FieldLabel>Bathrooms</FieldLabel>
                                      <Input
                                        min={0}
                                        onChange={(event) =>
                                          updateUnitField(
                                            unit.id,
                                            "bathrooms",
                                            event.target.value,
                                          )
                                        }
                                        step="0.5"
                                        type="number"
                                        value={unit.bathrooms}
                                      />
                                    </Label>
                                    <Label>
                                      <FieldLabel>Square Feet</FieldLabel>
                                      <Input
                                        min={0}
                                        onChange={(event) =>
                                          updateUnitField(
                                            unit.id,
                                            "squareFeet",
                                            event.target.value,
                                          )
                                        }
                                        type="number"
                                        value={unit.squareFeet}
                                      />
                                    </Label>
                                  </div>

                                  <div className="grid gap-5">
                                    <section>
                                      <FieldLabel>Rent Includes</FieldLabel>
                                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                                        {rentIncludeOptions.map((option) => (
                                          <label
                                            className="flex items-center gap-3 text-sm font-medium text-parcelis-charcoal"
                                            key={option.id}
                                          >
                                            <Checkbox
                                              checked={unit.rentIncludes.includes(
                                                option.id,
                                              )}
                                              onCheckedChange={(checked) =>
                                                updateUnitOption(
                                                  unit.id,
                                                  "rentIncludes",
                                                  option.id,
                                                  checked === true,
                                                )
                                              }
                                            />
                                            {option.label}
                                          </label>
                                        ))}
                                      </div>
                                    </section>

                                    <section>
                                      <FieldLabel>Amenities</FieldLabel>
                                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {amenityOptions.map((option) => (
                                          <label
                                            className="flex items-center gap-3 text-sm font-medium text-parcelis-charcoal"
                                            key={option.id}
                                          >
                                            <Checkbox
                                              checked={unit.amenities.includes(
                                                option.id,
                                              )}
                                              onCheckedChange={(checked) =>
                                                updateUnitOption(
                                                  unit.id,
                                                  "amenities",
                                                  option.id,
                                                  checked === true,
                                                )
                                              }
                                            />
                                            {option.label}
                                          </label>
                                        ))}
                                      </div>
                                    </section>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        className="justify-self-start"
                        onClick={addUnit}
                        type="button"
                        variant="secondary"
                      >
                        <Plus className="h-4 w-4" />
                        Add Unit
                      </Button>
                    </div>
                  )}

                  {error ? (
                    <p className="mt-5 text-sm font-medium text-red-700">
                      {error.message}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>

          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button
              className="min-w-40"
              onClick={closeAndReset}
              type="button"
              variant="secondary"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {currentStep === "unit" ? (
                <Button
                  className="min-w-32"
                  onClick={() => setCurrentStep("property")}
                  type="button"
                  variant="secondary"
                >
                  Back
                </Button>
              ) : null}
              <Button
                className="min-w-40"
                disabled={!canSubmit || isPending}
                type="submit"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {primaryActionLabel}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
