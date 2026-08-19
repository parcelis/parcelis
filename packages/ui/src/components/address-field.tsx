"use client";

import * as React from "react";
import { AlignRight } from "lucide-react";
import { FieldLabel } from "./label";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type AddressFieldValues = {
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
  region: string;
};

export function AddressField({
  addressLines,
  ariaLabel,
  label,
  onChange,
  onOpenChange,
  open,
  required = false,
  values,
}: {
  addressLines: string[];
  ariaLabel: string;
  label: string;
  onChange: (field: keyof AddressFieldValues, value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  required?: boolean;
  values: AddressFieldValues;
}) {
  const formattedAddress = addressLines.join(", ");

  return (
    <div className="grid gap-1 md:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <Popover onOpenChange={onOpenChange} open={open}>
        <div className="relative">
          <Input
            aria-label={label}
            className="cursor-pointer pr-10"
            onClick={() => onOpenChange(true)}
            placeholder="123 Main Street"
            readOnly
            required={required && !formattedAddress}
            value={formattedAddress}
          />
          <PopoverTrigger asChild>
            <button
              aria-label={ariaLabel}
              className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-parcelis-gray transition hover:bg-parcelis-porcelain hover:text-parcelis-charcoal"
              type="button"
            >
              <AlignRight className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent align="end" className="w-[min(calc(100vw-2rem),28rem)]">
          <div className="grid gap-4 md:grid-cols-2">
            <Label className="md:col-span-2">
              <FieldLabel>Address Line 1</FieldLabel>
              <Input
                onChange={(event) => onChange("line1", event.target.value)}
                placeholder="123 Main Street"
                value={values.line1}
              />
            </Label>
            <Label className="md:col-span-2">
              <FieldLabel>Address Line 2</FieldLabel>
              <Input
                onChange={(event) => onChange("line2", event.target.value)}
                placeholder="Suite 200"
                value={values.line2}
              />
            </Label>
            <Label className="md:col-span-2">
              <FieldLabel>City</FieldLabel>
              <Input onChange={(event) => onChange("city", event.target.value)} value={values.city} />
            </Label>
            <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
              <Label>
                <FieldLabel>State</FieldLabel>
                <Input
                  className="uppercase"
                  maxLength={2}
                  onChange={(event) => onChange("region", event.target.value)}
                  value={values.region}
                />
              </Label>
              <Label>
                <FieldLabel>Postal Code</FieldLabel>
                <Input onChange={(event) => onChange("postalCode", event.target.value)} value={values.postalCode} />
              </Label>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
