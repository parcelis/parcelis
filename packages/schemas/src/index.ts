import { z } from "zod";
import { LeaseStatus } from "@parcelis/db";

const idSchema = z.coerce.number().int().positive();

export const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(2).max(2),
  postalCode: z.string().min(5),
});

export const propertyStatusSchema = z.enum([
  "active",
  "maintenance",
  "leasing",
  "archived",
]);
export const propertyTypeValues = [
  "Apartment",
  "Commercial",
  "Condo",
  "Duplex",
  "HOA",
  "House",
  "Mixed-Use",
  "Other",
  "Parking",
  "Self-storage",
  "Manufactured Home",
  "Trailer",
] as const;
export const propertyTypeSchema = z.enum(propertyTypeValues);
export const unitTypeValues = ["Residential", "Commercial"] as const;
export const unitTypeSchema = z.enum(unitTypeValues);

export const optionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
});

export const updateAmenityInputSchema = optionSchema;
export const createTagInputSchema = z.object({
  label: z.string().trim().min(1).max(50),
});

export const unitDetailsInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().min(1),
  marketRateCents: z.number().int().nonnegative(),
  unitType: unitTypeSchema,
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().nonnegative().optional(),
  squareFeet: z.number().int().nonnegative().optional(),
  utilityTypeIds: z.array(idSchema).default([]),
  amenityTypeIds: z.array(idSchema).default([]),
});

export const createUnitInputSchema = unitDetailsInputSchema.omit({ id: true }).extend({
  propertyId: idSchema,
});

export const updateUnitInputSchema = unitDetailsInputSchema.extend({
  id: idSchema,
});

export const unitByIdInputSchema = z.object({
  id: idSchema,
});

export const listUnitsInputSchema = z.object({
  propertyId: idSchema.optional(),
});

export const propertySchema = z.object({
  id: idSchema,
  name: z.string().min(2),
  propertyType: propertyTypeSchema,
  tagIds: z.array(idSchema).max(20).default([]),
  address: addressSchema,
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  contactAddress: z.string().optional(),
  notes: z.string().optional(),
  unitCount: z.number().int().nonnegative(),
  units: z.array(unitDetailsInputSchema).default([]),
  occupiedUnits: z.number().int().nonnegative(),
  status: propertyStatusSchema,
});

export const tenantSchema = z.object({
  id: idSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export const leaseStatusSchema = z.enum(LeaseStatus);

export const leaseSchema = z.object({
  id: idSchema,
  propertyId: idSchema,
  tenantId: idSchema,
  unitLabel: z.string().min(1),
  monthlyRentCents: z.number().int().positive(),
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
  status: leaseStatusSchema,
});

export const createPropertyInputSchema = propertySchema.omit({
  id: true,
  occupiedUnits: true,
  status: true,
});

export const updatePropertyInputSchema = createPropertyInputSchema.extend({
  id: idSchema,
});

export const propertyByIdInputSchema = z.object({
  id: idSchema,
});

export const propertyNotesInputSchema = z.object({
  id: idSchema,
  notes: z.string().optional(),
});

export const propertyStatusInputSchema = z.object({
  id: idSchema,
});

export type Address = z.infer<typeof addressSchema>;
export type Property = z.infer<typeof propertySchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type UnitType = z.infer<typeof unitTypeSchema>;
export type Option = z.infer<typeof optionSchema>;
export type UnitDetailsInput = z.infer<typeof unitDetailsInputSchema>;
export type CreateUnitInput = z.infer<typeof createUnitInputSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitInputSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Lease = z.infer<typeof leaseSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertyInputSchema>;
