"use client";

import * as React from "react";
import { AlignRight, Building2, ChevronDown, DoorOpen, Home, Loader2, Plus, Settings, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
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
import { useShortcut } from "./shortcut-provider";

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

type AddPropertyDrawerProps = {
  error?: Error | null;
  form: PropertyFormState;
  isPending: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<PropertyFormState>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreatePropertyInput) => void;
  open: boolean;
};

const steps = [
  { label: "Property Details", icon: Home, active: true },
  { label: "Unit Details", icon: DoorOpen, active: false },
  { label: "Property Settings", icon: Settings, active: false },
];

export function AddPropertyDrawer({
  error,
  form,
  isPending,
  onFormChange,
  onOpenChange,
  onSubmit,
  open,
}: AddPropertyDrawerProps) {
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = React.useState(false);
  const [isContactAddressPopoverOpen, setIsContactAddressPopoverOpen] = React.useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = React.useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState(false);
  const canSubmit = Boolean(
    form.name && form.line1 && form.city && form.region && form.postalCode && form.propertyType && form.unitCount,
  );
  const hasFormChanges = Object.entries(form).some(
    ([field, value]) => value !== initialPropertyFormState[field as keyof PropertyFormState],
  );
  const cityLine = [form.city, [form.region, form.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const addressLines = [form.line1, form.line2, cityLine].filter(Boolean);
  const contactCityLine = [form.contactCity, [form.contactRegion, form.contactPostalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const contactAddressLines = [form.contactAddressLine1, form.contactAddressLine2, contactCityLine].filter(Boolean);
  const contactAddress = contactAddressLines.join("\n");
  useShortcut("Mod+Enter", () => submitPropertyInput(), {
    enabled: open && canSubmit && !isPending,
  });

  function updateField<Key extends keyof PropertyFormState>(field: Key, value: PropertyFormState[Key]) {
    onFormChange((current) => ({ ...current, [field]: value }));
  }

  function submitProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    });
  }

  function closeAndReset() {
    if (hasFormChanges) {
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
    onFormChange(initialPropertyFormState);
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
      <DrawerContent className="max-w-[860px]">
        <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Your changes will not be saved.</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you'd like to cancel?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsDiscardDialogOpen(false)}>
                Keep Editing
              </Button>
              <Button type="button" onClick={resetAndClose}>
                Cancel
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submitProperty}>
          <DrawerHeader className="flex items-center gap-3">
            <DrawerClose />
            <DrawerTitle>Add Property</DrawerTitle>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
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

            <div className="grid gap-6 px-4 py-6 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="overflow-hidden rounded-md border border-parcelis-border bg-white dark:bg-parcelis-slate lg:sticky lg:top-6 lg:self-start">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div
                      className={`flex items-center gap-3 border-parcelis-border px-4 py-4 ${
                        index > 0 ? "border-t" : ""
                      } ${step.active ? "bg-parcelis-porcelain/70 text-parcelis-charcoal dark:bg-parcelis-charcoal/55" : "text-parcelis-gray"}`}
                      key={step.label}
                    >
                      <Icon className={`h-5 w-5 ${step.active ? "text-parcelis-green" : "text-parcelis-gray"}`} />
                      <span className="text-sm font-semibold">{step.label}</span>
                    </div>
                  );
                })}
              </aside>

              <section>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-parcelis-charcoal">Property Details</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="grid gap-1 md:col-span-2">
                      <FieldLabel>Property Address</FieldLabel>
                      <Popover open={isAddressPopoverOpen} onOpenChange={setIsAddressPopoverOpen}>
                        <div className="relative">
                          <Input
                            className="pr-10"
                            onChange={(event) => updateField("line1", event.target.value)}
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
                        <PopoverContent>
                          <div className="grid gap-4 md:grid-cols-2">
                            <Label className="md:col-span-2">
                              <FieldLabel>Address Line 1</FieldLabel>
                              <Input
                                onChange={(event) => updateField("line1", event.target.value)}
                                placeholder="123 Main Street"
                                value={form.line1}
                              />
                            </Label>
                            <Label className="md:col-span-2">
                              <FieldLabel>Address Line 2</FieldLabel>
                              <Input
                                onChange={(event) => updateField("line2", event.target.value)}
                                placeholder="Suite 200"
                                value={form.line2}
                              />
                            </Label>
                            <Label className="md:col-span-2">
                              <FieldLabel>City</FieldLabel>
                              <Input onChange={(event) => updateField("city", event.target.value)} value={form.city} />
                            </Label>
                            <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                              <Label>
                                <FieldLabel>State</FieldLabel>
                                <Input
                                  className="uppercase"
                                  maxLength={2}
                                  onChange={(event) => updateField("region", event.target.value)}
                                  value={form.region}
                                />
                              </Label>
                              <Label>
                                <FieldLabel>Postal Code</FieldLabel>
                                <Input onChange={(event) => updateField("postalCode", event.target.value)} value={form.postalCode} />
                              </Label>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {addressLines.length > 0 ? (
                        <div className="space-y-0.5 text-xs text-parcelis-gray">
                          {addressLines.map((line, index) => (
                            <p className="truncate" key={`${line}-${index}`}>
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>

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
                  </div>

                  <button
                    className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-parcelis-charcoal hover:underline"
                    onClick={() => setIsContactInfoOpen((current) => !current)}
                    type="button"
                  >
                    Property Contact Info
                    <ChevronDown className={`h-4 w-4 transition-transform ${isContactInfoOpen ? "rotate-180" : ""}`} />
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
                      <div className="grid gap-1 md:col-span-2">
                        <FieldLabel>Contact Address</FieldLabel>
                        <Popover open={isContactAddressPopoverOpen} onOpenChange={setIsContactAddressPopoverOpen}>
                          <div className="relative">
                            <Input
                              className="pr-10"
                              onChange={(event) => updateField("contactAddressLine1", event.target.value)}
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
                          <PopoverContent>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Label className="md:col-span-2">
                                <FieldLabel>Address Line 1</FieldLabel>
                                <Input
                                  onChange={(event) => updateField("contactAddressLine1", event.target.value)}
                                  value={form.contactAddressLine1}
                                />
                              </Label>
                              <Label className="md:col-span-2">
                                <FieldLabel>Address Line 2</FieldLabel>
                                <Input
                                  onChange={(event) => updateField("contactAddressLine2", event.target.value)}
                                  value={form.contactAddressLine2}
                                />
                              </Label>
                              <Label className="md:col-span-2">
                                <FieldLabel>City</FieldLabel>
                                <Input onChange={(event) => updateField("contactCity", event.target.value)} value={form.contactCity} />
                              </Label>
                              <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                                <Label>
                                  <FieldLabel>State</FieldLabel>
                                  <Input
                                    className="uppercase"
                                    maxLength={2}
                                    onChange={(event) => updateField("contactRegion", event.target.value)}
                                    value={form.contactRegion}
                                  />
                                </Label>
                                <Label>
                                  <FieldLabel>Postal Code</FieldLabel>
                                  <Input
                                    onChange={(event) => updateField("contactPostalCode", event.target.value)}
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
                              <p className="truncate" key={`${line}-${index}`}>
                                {line}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {error ? <p className="mt-5 text-sm font-medium text-red-700">{error.message}</p> : null}
                </div>
              </section>
            </div>
          </div>

          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button className="min-w-40" onClick={closeAndReset} type="button" variant="secondary">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button className="min-w-40" disabled={!canSubmit || isPending} type="submit">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Next
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
