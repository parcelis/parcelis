"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bath,
  BedDouble,
  Building2,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  ExternalLink,
  Home,
  Loader2,
  Plus,
  Ruler,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  AddressField,
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
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
import { propertyTypeValues, type CreatePropertyInput, type PropertyType } from "@parcelis/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, queryKeys } from "./api-client";
import { LoadingState } from "./loading-state";
import { useShortcut, type ShortcutKey } from "./shortcut-provider";
import { ImageUploadPanel } from "./image-upload-panel";

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
  tagIds: number[];
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
  tagIds: [],
};

type DrawerStep = "property" | "unit";
type UnitType = "Residential" | "Commercial";
type UnitId = number | string;

export type UnitDetailsFormState = {
  id: UnitId;
  unitName: string;
  marketRate: string;
  unitType: UnitType;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  utilities: number[];
  amenities: number[];
};

function createUnitDetailsFormState(index = 0): UnitDetailsFormState {
  return {
    id: `new-${Date.now()}-${index}`,
    unitName: `Unit ${index + 1}`,
    marketRate: "",
    unitType: "Residential",
    bedrooms: "",
    bathrooms: "",
    squareFeet: "",
    utilities: [],
    amenities: [],
  };
}

function getInitialUnitFormStates(initialUnits?: UnitDetailsFormState[]) {
  return initialUnits && initialUnits.length > 0 ? initialUnits : [createUnitDetailsFormState()];
}

type PropertyDrawerProps = {
  cancelDescription?: string;
  drawerTitle?: string;
  error?: Error | null;
  form: PropertyFormState;
  initialFormState?: PropertyFormState;
  initialExpandedUnitId?: UnitId;
  initialStep?: DrawerStep;
  initialUnits?: UnitDetailsFormState[];
  imageFile?: File | null;
  imageUrl?: string | null;
  isImageDeletePending?: boolean;
  isPending: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<PropertyFormState>>;
  onImageChange?: (file: File | null) => void;
  onImageDelete?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreatePropertyInput, imageFile: File | null) => void;
  open: boolean;
  submitLabel?: string;
  toggleShortcut?: ShortcutKey;
  unitHref?: (unit: UnitDetailsFormState) => string | null;
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
  initialExpandedUnitId,
  initialStep = "property",
  initialUnits,
  imageFile = null,
  imageUrl = null,
  isImageDeletePending = false,
  isPending,
  onFormChange,
  onImageChange,
  onImageDelete,
  onOpenChange,
  onSubmit,
  open,
  submitLabel = "Create Property",
  toggleShortcut = "Mod+Shift+P",
  unitHref,
}: PropertyDrawerProps) {
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState(imageUrl);
  const queryClient = useQueryClient();
  const initialUnitStates = React.useMemo(() => getInitialUnitFormStates(initialUnits), [initialUnits]);
  const [currentStep, setCurrentStep] = React.useState<DrawerStep>(initialStep);
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = React.useState(false);
  const [isContactAddressPopoverOpen, setIsContactAddressPopoverOpen] = React.useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = React.useState(false);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = React.useState(false);
  const [customTag, setCustomTag] = React.useState("");
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState(false);
  const [imageValidationError, setImageValidationError] = React.useState<string | null>(null);
  const [unitPendingRemovalId, setUnitPendingRemovalId] = React.useState<UnitId | null>(null);
  const [units, setUnits] = React.useState<UnitDetailsFormState[]>(() => [...initialUnitStates]);
  const [expandedUnitIds, setExpandedUnitIds] = React.useState<Set<UnitId>>(() => new Set());
  const drawerScrollRef = React.useRef<HTMLDivElement | null>(null);
  const unitCardRefs = React.useRef(new Map<UnitId, HTMLDivElement>());
  const unitOptionsQuery = useQuery({
    queryKey: queryKeys.unitOptions.list,
    queryFn: () => apiClient.unitOptions.list.query(),
  });
  const tagsQuery = useQuery({
    queryKey: queryKeys.tags.list,
    queryFn: () => apiClient.tags.list.query(),
  });
  const createTag = useMutation({
    mutationFn: (label: string) => apiClient.tags.create.mutate({ label }),
    onSuccess: async (tag) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags.list });
      onFormChange((current) => ({
        ...current,
        tagIds: [...current.tagIds, tag.id],
      }));
      setCustomTag("");
    },
  });
  const canContinueToUnitDetails = Boolean(
    form.name && form.line1 && form.city && form.region && form.postalCode && form.propertyType && form.unitCount,
  );
  const canSubmitUnitDetails =
    units.length > 0 && units.every((unit) => unit.unitName && unit.marketRate && unit.unitType);
  const hasFormChanges = Object.entries(form).some(([field, value]) => {
    const initialValue = initialFormState[field as keyof PropertyFormState];
    return Array.isArray(value) && Array.isArray(initialValue)
      ? value.length !== initialValue.length || value.some((item, index) => item !== initialValue[index])
      : value !== initialValue;
  });
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
      ? canContinueToUnitDetails && !imageValidationError
      : canSubmitUnitDetails && !imageValidationError;
  const primaryActionLabel = currentStep === "property" ? "Next" : submitLabel;
  const hasImageChange = Boolean(imageFile);
  const cityLine = [form.city, [form.region, form.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const addressLines = [form.line1, form.line2, cityLine].filter(Boolean);
  const contactCityLine = [form.contactCity, [form.contactRegion, form.contactPostalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const contactAddressLines = [form.contactAddressLine1, form.contactAddressLine2, contactCityLine].filter(Boolean);
  const contactAddress = contactAddressLines.join("\n");
  const utilityTypes = unitOptionsQuery.data?.utilities ?? [];
  const amenityTypes = unitOptionsQuery.data?.amenityTypes ?? [];
  const propertyTagIds = form.tagIds ?? [];
  const tags = tagsQuery.data ?? [];
  const selectedTags = tags.filter((tag) => propertyTagIds.includes(tag.id));
  const unitPendingRemoval = units.find((unit) => unit.id === unitPendingRemovalId) ?? null;
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
      setExpandedUnitIds(initialExpandedUnitId ? new Set([initialExpandedUnitId]) : new Set());
      setIsAddressPopoverOpen(false);
      setIsContactAddressPopoverOpen(false);
      setIsContactInfoOpen(false);
      setIsTagPopoverOpen(false);
      setIsDiscardDialogOpen(false);
      setImageValidationError(null);
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
    setIsTagPopoverOpen(false);
    setIsDiscardDialogOpen(false);
    setImageValidationError(null);
    setUnitPendingRemovalId(null);
  }, [initialExpandedUnitId, initialStep, initialUnitStates, open]);

  React.useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(imageUrl);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile, imageUrl]);

  React.useEffect(() => {
    if (!open || currentStep !== "unit" || !initialExpandedUnitId) {
      return;
    }

    setExpandedUnitIds((current) => new Set(current).add(initialExpandedUnitId));

    const timeouts = [0, 80, 180, 320].map((delay) =>
      window.setTimeout(() => {
        const scrollContainer = drawerScrollRef.current;
        const unitCard = unitCardRefs.current.get(initialExpandedUnitId);

        if (!scrollContainer || !unitCard) {
          return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const unitRect = unitCard.getBoundingClientRect();
        const targetTop =
          scrollContainer.scrollTop +
          unitRect.top -
          containerRect.top -
          Math.max((containerRect.height - unitRect.height) / 2, 24);

        scrollContainer.scrollTo({
          top: Math.max(targetTop, 0),
          behavior: delay === 0 ? "auto" : "smooth",
        });
      }, delay),
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [currentStep, initialExpandedUnitId, open]);

  function updateField<Key extends keyof PropertyFormState>(field: Key, value: PropertyFormState[Key]) {
    onFormChange((current) => ({ ...current, [field]: value }));
  }

  function updateUnitField<Key extends keyof UnitDetailsFormState>(
    unitId: UnitId,
    field: Key,
    value: UnitDetailsFormState[Key],
  ) {
    setUnits((current) => current.map((unit) => (unit.id === unitId ? { ...unit, [field]: value } : unit)));
  }

  function updateUnitOption(unitId: UnitId, field: "utilities" | "amenities", optionId: number, checked: boolean) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              [field]: checked ? [...unit[field], optionId] : unit[field].filter((value) => value !== optionId),
            }
          : unit,
      ),
    );
  }

  function toggleTag(tagId: number, checked: boolean) {
    onFormChange((current) => ({
      ...current,
      tagIds: checked
        ? [...(current.tagIds ?? []), tagId]
        : (current.tagIds ?? []).filter((currentTagId) => currentTagId !== tagId),
    }));
  }

  function addCustomTag() {
    const label = customTag.trim();
    if (!label || createTag.isPending) {
      return;
    }
    const existingTag = tags.find((tag) => tag.label.toLowerCase() === label.toLowerCase());
    if (existingTag) {
      toggleTag(existingTag.id, true);
      setCustomTag("");
      return;
    }
    createTag.mutate(label);
  }

  function addUnit() {
    setUnits((current) => {
      const nextUnit = createUnitDetailsFormState(current.length);
      setExpandedUnitIds((expanded) => new Set(expanded).add(nextUnit.id));
      return [...current, nextUnit];
    });
  }

  function removeUnit(unitId: UnitId) {
    setUnits((current) => (current.length > 1 ? current.filter((unit) => unit.id !== unitId) : current));
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

  function toggleUnit(unitId: UnitId) {
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

  function isPersistedUnitId(value: UnitId): value is number {
    return typeof value === "number";
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
    onSubmit(
      {
        name: form.name,
        propertyType: form.propertyType,
        tagIds: propertyTagIds,
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
          id: isPersistedUnitId(unit.id) ? unit.id : undefined,
          name: unit.unitName,
          marketRateCents: parseMarketRateCents(unit.marketRate),
          unitType: unit.unitType,
          bedrooms: parseOptionalInteger(unit.bedrooms),
          bathrooms: parseOptionalNumber(unit.bathrooms),
          squareFeet: parseOptionalInteger(unit.squareFeet),
          utilityTypeIds: unit.utilities,
          amenityTypeIds: unit.amenities,
        })),
      },
      imageFile,
    );
  }

  function removeImage() {
    if (imageFile) {
      onImageChange?.(null);
      return;
    }

    onImageDelete?.();
  }

  function closeAndReset() {
    if (hasFormChanges || hasUnitDetailsChanges || hasImageChange) {
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
    setIsTagPopoverOpen(false);
    setUnitPendingRemovalId(null);
    setCurrentStep(initialStep);
    setUnits([...initialUnitStates]);
    setExpandedUnitIds(new Set());
    onImageChange?.(null);
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
      <DrawerContent size="lg">
        <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Your changes will not be saved.</AlertDialogTitle>
              <AlertDialogDescription>{cancelDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsDiscardDialogOpen(false)}>
                Keep Editing
              </Button>
              <Button type="button" onClick={resetAndClose}>
                Discard
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={Boolean(unitPendingRemoval)}
          onOpenChange={(nextOpen) => !nextOpen && setUnitPendingRemovalId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Unit</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {unitPendingRemoval?.unitName || "this unit"} from the property if you continue.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" variant="secondary" onClick={() => setUnitPendingRemovalId(null)}>
                Keep Unit
              </Button>
              <Button type="button" onClick={confirmUnitRemoval}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitProperty}>
          <DrawerHeader className="flex items-center gap-3">
            <DrawerClose />
            <DrawerTitle>{drawerTitle}</DrawerTitle>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto" ref={drawerScrollRef}>
            <div className="px-4 py-5 md:px-6">
              <div className="grid gap-4 rounded-lg border border-parcelis-border bg-parcelis-charcoal p-4 text-white md:grid-cols-[3rem_minmax(0,1fr)_8rem] md:items-center dark:bg-parcelis-slate">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-white/10 text-parcelis-green">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{form.name || "Property Name"}</p>
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
                  <p className="text-xs font-semibold uppercase text-white/55">Units</p>
                  <p className="mt-1 text-base font-semibold text-white">{form.unitCount || "-"}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-10 px-4 py-6 md:px-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="grid gap-6 lg:sticky lg:top-6 lg:self-start">
                <aside className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate">
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
                          <span className="text-sm font-semibold">{step.label}</span>
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
                        <Icon className={`h-5 w-5 ${isActive ? "text-parcelis-green" : "text-parcelis-gray"}`} />
                        <span className="text-sm font-semibold">{step.label}</span>
                      </button>
                    );
                  })}
                </aside>

                <ImageUploadPanel
                  acceptedImageDescription="GIF, JPG, PNG, or WebP"
                  acceptedImageTypes={["image/jpeg", "image/png", "image/webp", "image/gif"]}
                  alt="Selected property"
                  imagePreviewUrl={imagePreviewUrl}
                  isDeletePending={isImageDeletePending}
                  onDelete={removeImage}
                  onImageChange={(file) => onImageChange?.(file)}
                  onValidationErrorChange={setImageValidationError}
                  title="Property Image"
                />
              </div>

              <section>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">
                    {currentStep === "property" ? "Property Details" : "Unit Details"}
                  </h3>
                  {currentStep === "property" ? (
                    <>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <AddressField
                          addressLines={addressLines}
                          ariaLabel="Show property address details"
                          label="Property Address"
                          onChange={updateField}
                          onOpenChange={setIsAddressPopoverOpen}
                          open={isAddressPopoverOpen}
                          required
                          values={form}
                        />

                        <Label className="md:col-span-2">
                          <FieldLabel>Name</FieldLabel>
                          <Input
                            onChange={(event) => updateField("name", event.target.value)}
                            placeholder="Vine Street Lofts"
                            required
                            value={form.name}
                          />
                        </Label>

                        <Label>
                          <FieldLabel>Property Type</FieldLabel>
                          <Select
                            onChange={(event) => updateField("propertyType", event.target.value as PropertyType)}
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
                            onChange={(event) => updateField("unitCount", event.target.value)}
                            required
                            type="number"
                            value={form.unitCount}
                          />
                        </Label>

                        <div className="grid gap-3 md:col-span-2">
                          <FieldLabel>Tags</FieldLabel>
                          <Popover open={isTagPopoverOpen} onOpenChange={setIsTagPopoverOpen}>
                            <PopoverTrigger asChild>
                              <button
                                className="flex min-h-10 w-full items-center gap-2 rounded-md border border-parcelis-border bg-white px-3 py-1.5 text-left text-sm transition hover:border-parcelis-gray focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parcelis-green"
                                type="button"
                              >
                                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                  {selectedTags.length > 0 ? (
                                    selectedTags.map((tag) => (
                                      <Badge key={tag.id} variant="secondary">
                                        {tag.label}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="py-1 text-parcelis-gray">Select tags</span>
                                  )}
                                </span>
                                <ChevronDown className="h-4 w-4 shrink-0 text-parcelis-gray" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[min(calc(100vw-2rem),32rem)] p-3">
                              <div className="flex gap-2">
                                <Input
                                  aria-label="Add custom tag"
                                  onChange={(event) => setCustomTag(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      addCustomTag();
                                    }
                                  }}
                                  placeholder="Add custom tag"
                                  value={customTag}
                                />
                                <Button
                                  aria-label="Add custom tag"
                                  className="w-10 shrink-0 px-0"
                                  disabled={createTag.isPending}
                                  onClick={addCustomTag}
                                  type="button"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="mt-3 grid max-h-52 gap-1 overflow-y-auto">
                                {tagsQuery.isPending ? (
                                  <LoadingState
                                    className="min-h-0 justify-start px-2 py-3"
                                    iconClassName="h-5 w-5"
                                    label="Loading tags…"
                                  />
                                ) : tagsQuery.isError ? (
                                  <p className="px-2 py-3 text-sm text-parcelis-gray">
                                    Tags could not be loaded. Restart the API and try again.
                                  </p>
                                ) : tags.length === 0 ? (
                                  <p className="px-2 py-3 text-sm text-parcelis-gray">No tags are available.</p>
                                ) : (
                                  tags.map((tag) => (
                                    <label
                                      className={`flex items-center gap-3 rounded px-2 py-2 text-sm font-medium text-parcelis-charcoal transition hover:bg-parcelis-porcelain ${propertyTagIds.includes(tag.id) ? "bg-parcelis-porcelain" : ""}`}
                                      key={tag.id}
                                    >
                                      <Checkbox
                                        checked={propertyTagIds.includes(tag.id)}
                                        onCheckedChange={(checked) => toggleTag(tag.id, checked === true)}
                                      />
                                      <span>{tag.label}</span>
                                    </label>
                                  ))
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <button
                        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-parcelis-charcoal hover:underline"
                        onClick={() => setIsContactInfoOpen((current) => !current)}
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
                              onChange={(event) => updateField("contactName", event.target.value)}
                              value={form.contactName}
                            />
                          </Label>
                          <Label>
                            <FieldLabel>Contact Email</FieldLabel>
                            <Input
                              onChange={(event) => updateField("contactEmail", event.target.value)}
                              type="email"
                              value={form.contactEmail}
                            />
                          </Label>
                          <Label>
                            <FieldLabel>Contact Phone</FieldLabel>
                            <Input
                              onChange={(event) => updateField("contactPhone", event.target.value)}
                              type="tel"
                              value={form.contactPhone}
                            />
                          </Label>
                          <AddressField
                            addressLines={contactAddressLines}
                            ariaLabel="Show contact address details"
                            label="Contact Address"
                            onChange={(field, value) => {
                              const contactFields = {
                                city: "contactCity",
                                line1: "contactAddressLine1",
                                line2: "contactAddressLine2",
                                postalCode: "contactPostalCode",
                                region: "contactRegion",
                              } as const;
                              updateField(contactFields[field], value);
                            }}
                            onOpenChange={setIsContactAddressPopoverOpen}
                            open={isContactAddressPopoverOpen}
                            values={{
                              city: form.contactCity,
                              line1: form.contactAddressLine1,
                              line2: form.contactAddressLine2,
                              postalCode: form.contactPostalCode,
                              region: form.contactRegion,
                            }}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-5 grid gap-5">
                      {units.map((unit) => {
                        const isExpanded = expandedUnitIds.has(unit.id);
                        const href = unitHref?.(unit) ?? null;

                        return (
                          <div
                            className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate"
                            id={`property-drawer-unit-${unit.id}`}
                            key={unit.id}
                            ref={(node) => {
                              if (node) {
                                unitCardRefs.current.set(unit.id, node);
                              } else {
                                unitCardRefs.current.delete(unit.id);
                              }
                            }}
                          >
                            <div className="grid gap-4 border-b border-parcelis-border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                              <div className="grid gap-4 md:grid-cols-3">
                                <Label>
                                  <FieldLabel>Unit Name</FieldLabel>
                                  <Input
                                    onChange={(event) => updateUnitField(unit.id, "unitName", event.target.value)}
                                    placeholder="Unit 1A"
                                    required
                                    value={unit.unitName}
                                  />
                                </Label>
                                <Label>
                                  <FieldLabel>Market Rate</FieldLabel>
                                  <Input
                                    min={0}
                                    onChange={(event) => updateUnitField(unit.id, "marketRate", event.target.value)}
                                    required
                                    type="number"
                                    value={unit.marketRate}
                                  />
                                </Label>
                                <Label>
                                  <FieldLabel>Unit Type</FieldLabel>
                                  <Select
                                    onChange={(event) =>
                                      updateUnitField(unit.id, "unitType", event.target.value as UnitType)
                                    }
                                    required
                                    value={unit.unitType}
                                  >
                                    <option value="Residential">Residential</option>
                                    <option value="Commercial">Commercial</option>
                                  </Select>
                                </Label>
                              </div>

                              <div className="flex items-start justify-end">
                                <div className="flex items-center gap-2">
                                  {href ? (
                                    <Link
                                      aria-label={`Open ${unit.unitName || "unit"}`}
                                      className="inline-grid h-9 w-9 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
                                      href={href}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Link>
                                  ) : null}
                                  <button
                                    aria-label={`Remove ${unit.unitName || "unit"}`}
                                    className="inline-grid h-9 w-9 place-items-center rounded-md border border-parcelis-border text-parcelis-gray transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={units.length === 1}
                                    onClick={() => setUnitPendingRemovalId(unit.id)}
                                    type="button"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
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
                                        onChange={(event) => updateUnitField(unit.id, "bedrooms", event.target.value)}
                                        type="number"
                                        value={unit.bedrooms}
                                      />
                                    </Label>
                                    <Label>
                                      <FieldLabel>Bathrooms</FieldLabel>
                                      <Input
                                        min={0}
                                        onChange={(event) => updateUnitField(unit.id, "bathrooms", event.target.value)}
                                        step="0.5"
                                        type="number"
                                        value={unit.bathrooms}
                                      />
                                    </Label>
                                    <Label>
                                      <FieldLabel>Square Feet</FieldLabel>
                                      <Input
                                        min={0}
                                        onChange={(event) => updateUnitField(unit.id, "squareFeet", event.target.value)}
                                        type="number"
                                        value={unit.squareFeet}
                                      />
                                    </Label>
                                  </div>

                                  <div className="grid gap-5">
                                    <section>
                                      <FieldLabel>Utilities Included</FieldLabel>
                                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                                        {utilityTypes.map((option) => (
                                          <label
                                            className="flex items-center gap-3 text-sm font-medium text-parcelis-charcoal"
                                            key={option.id}
                                          >
                                            <Checkbox
                                              checked={unit.utilities.includes(option.id)}
                                              onCheckedChange={(checked) =>
                                                updateUnitOption(unit.id, "utilities", option.id, checked === true)
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
                                        {amenityTypes.map((option) => (
                                          <label
                                            className="flex items-center gap-3 text-sm font-medium text-parcelis-charcoal"
                                            key={option.id}
                                          >
                                            <Checkbox
                                              checked={unit.amenities.includes(option.id)}
                                              onCheckedChange={(checked) =>
                                                updateUnitOption(unit.id, "amenities", option.id, checked === true)
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

                      <Button className="justify-self-start" onClick={addUnit} type="button" variant="secondary">
                        <Plus className="h-4 w-4" />
                        Add Unit
                      </Button>
                    </div>
                  )}

                  {error ? (
                    <p className="mt-5 text-sm font-medium text-red-700">{error.message}</p>
                  ) : imageValidationError ? (
                    <p className="mt-5 text-sm font-medium text-red-700">{imageValidationError}</p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>

          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button className="min-w-40" onClick={closeAndReset} type="button" variant="secondary">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {currentStep === "unit" ? (
                <Button
                  className="min-w-40"
                  onClick={() => setCurrentStep("property")}
                  type="button"
                  variant="secondary"
                >
                  Back
                </Button>
              ) : null}
              <Button className="min-w-40" disabled={!canSubmit || isPending} type="submit">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : primaryActionLabel === "Next" ? null : (
                  <Plus className="h-4 w-4" />
                )}
                {primaryActionLabel}
                {!isPending && primaryActionLabel === "Next" ? <ChevronRight className="h-4 w-4" /> : null}
              </Button>
            </div>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
