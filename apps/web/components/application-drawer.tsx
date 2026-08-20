"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import {
  AddressField,
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
  Label,
  Select,
} from "@parcelis/ui";
import type { AddressFieldValues } from "@parcelis/ui";
import type { CreateApplicationInput } from "@parcelis/schemas";
import { toUtcDateInput } from "../lib/date";

type ApplicationDrawerInitialValues = {
  propertyId: number;
  statusId: number;
  annualIncomeCents: number;
  requestedMoveInDate: Date | string | null;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    dateOfBirth: Date | string | null;
    employment: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
  };
};

type ApplicationDrawerProps = {
  drawerTitle: string;
  error?: Error | null;
  initialValues?: ApplicationDrawerInitialValues;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateApplicationInput) => void;
  open: boolean;
  properties: Array<{ id: number; name: string }>;
  statuses: Array<{ id: number; label: string }>;
  submitLabel: string;
};

function toFormState(initialValues?: ApplicationDrawerInitialValues) {
  return {
    propertyId: initialValues ? String(initialValues.propertyId) : "",
    statusId: initialValues ? String(initialValues.statusId) : "",
    annualIncomeCents: initialValues ? String(initialValues.annualIncomeCents / 100) : "",
    requestedMoveInDate: initialValues?.requestedMoveInDate ? toUtcDateInput(initialValues.requestedMoveInDate) : "",
    firstName: initialValues?.applicant.firstName ?? "",
    lastName: initialValues?.applicant.lastName ?? "",
    email: initialValues?.applicant.email ?? "",
    phone: initialValues?.applicant.phone ?? "",
    dateOfBirth: initialValues?.applicant.dateOfBirth ? toUtcDateInput(initialValues.applicant.dateOfBirth) : "",
    employment: initialValues?.applicant.employment ?? "",
    addressLine1: initialValues?.applicant.addressLine1 ?? "",
    addressLine2: initialValues?.applicant.addressLine2 ?? "",
    city: initialValues?.applicant.city ?? "",
    region: initialValues?.applicant.region ?? "",
    postalCode: initialValues?.applicant.postalCode ?? "",
  };
}

type ApplicationFormState = ReturnType<typeof toFormState>;

export function ApplicationDrawer({
  drawerTitle,
  error,
  initialValues,
  isPending,
  onOpenChange,
  onSubmit,
  open,
  properties,
  statuses,
  submitLabel,
}: ApplicationDrawerProps) {
  const [form, setForm] = React.useState<ApplicationFormState>(() => toFormState(initialValues));
  const [isAddressPopoverOpen, setIsAddressPopoverOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toFormState(initialValues));
  }, [open, initialValues]);

  function updateField<Key extends keyof ApplicationFormState>(field: Key, value: ApplicationFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateAddressField(field: keyof AddressFieldValues, value: string) {
    if (field === "line1") updateField("addressLine1", value);
    else if (field === "line2") updateField("addressLine2", value);
    else updateField(field, value);
  }

  const cityLine = [form.city, [form.region, form.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const addressLines = [form.addressLine1, form.addressLine2, cityLine].filter(Boolean);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      propertyId: Number(form.propertyId),
      statusId: Number(form.statusId),
      annualIncomeCents: Math.round(Number(form.annualIncomeCents || 0) * 100),
      requestedMoveInDate: form.requestedMoveInDate ? new Date(`${form.requestedMoveInDate}T00:00:00.000Z`) : undefined,
      applicant: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dateOfBirth: form.dateOfBirth ? new Date(`${form.dateOfBirth}T00:00:00.000Z`) : undefined,
        employment: form.employment.trim() || undefined,
        address: {
          line1: form.addressLine1.trim(),
          line2: form.addressLine2.trim() || undefined,
          city: form.city.trim(),
          region: form.region.trim().toUpperCase(),
          postalCode: form.postalCode.trim(),
        },
      },
    });
  }

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <DrawerContent size="lg">
        <DrawerHeader className="flex items-center gap-3">
          <DrawerClose disabled={isPending} />
          <DrawerTitle>{drawerTitle}</DrawerTitle>
        </DrawerHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <section>
              <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Application details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Label className="gap-2">
                  Property *
                  <Select
                    onChange={(event) => updateField("propertyId", event.target.value)}
                    required
                    value={form.propertyId}
                  >
                    <option value="">Select property</option>
                    {properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="gap-2">
                  Status *
                  <Select
                    onChange={(event) => updateField("statusId", event.target.value)}
                    required
                    value={form.statusId}
                  >
                    <option value="">Select status</option>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label className="gap-2">
                  Annual Income *
                  <Input
                    min="0"
                    onChange={(event) => updateField("annualIncomeCents", event.target.value)}
                    required
                    step="0.01"
                    type="number"
                    value={form.annualIncomeCents}
                  />
                </Label>
                <Label className="gap-2">
                  Requested Move-In Date
                  <Input
                    onChange={(event) => updateField("requestedMoveInDate", event.target.value)}
                    type="date"
                    value={form.requestedMoveInDate}
                  />
                </Label>
              </div>
            </section>

            <section className="mt-8 border-t border-parcelis-border pt-6">
              <h3 className="font-semibold text-parcelis-charcoal dark:text-white">Applicant</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Label className="gap-2">
                  First Name *
                  <Input
                    onChange={(event) => updateField("firstName", event.target.value)}
                    required
                    value={form.firstName}
                  />
                </Label>
                <Label className="gap-2">
                  Last Name *
                  <Input
                    onChange={(event) => updateField("lastName", event.target.value)}
                    required
                    value={form.lastName}
                  />
                </Label>
                <Label className="gap-2">
                  Email *
                  <Input
                    onChange={(event) => updateField("email", event.target.value)}
                    required
                    type="email"
                    value={form.email}
                  />
                </Label>
                <Label className="gap-2">
                  Phone
                  <Input onChange={(event) => updateField("phone", event.target.value)} type="tel" value={form.phone} />
                </Label>
                <Label className="gap-2">
                  Date of Birth
                  <Input
                    onChange={(event) => updateField("dateOfBirth", event.target.value)}
                    type="date"
                    value={form.dateOfBirth}
                  />
                </Label>
                <Label className="gap-2">
                  Employment
                  <Input
                    onChange={(event) => updateField("employment", event.target.value)}
                    placeholder="Employer or occupation"
                    value={form.employment}
                  />
                </Label>
                <AddressField
                  addressLines={addressLines}
                  ariaLabel="Show applicant address details"
                  label="Applicant Address"
                  onChange={updateAddressField}
                  onOpenChange={setIsAddressPopoverOpen}
                  open={isAddressPopoverOpen}
                  required
                  values={{
                    line1: form.addressLine1,
                    line2: form.addressLine2,
                    city: form.city,
                    region: form.region,
                    postalCode: form.postalCode,
                  }}
                />
              </div>
            </section>
            {error ? <p className="mt-5 text-sm font-medium text-red-700">{error.message}</p> : null}
          </div>
          <DrawerFooter className="flex items-center justify-between gap-3">
            <Button disabled={isPending} onClick={() => onOpenChange(false)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button className="min-w-40" disabled={isPending} type="submit">
              {submitLabel}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
