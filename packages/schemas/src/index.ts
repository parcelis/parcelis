import { z } from "zod";

export const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(2).max(2),
  postalCode: z.string().min(5),
});

export const propertyStatusSchema = z.enum(["active", "maintenance", "leasing", "archived"]);
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

export const propertySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  propertyType: propertyTypeSchema,
  address: addressSchema,
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  contactAddress: z.string().optional(),
  unitCount: z.number().int().nonnegative(),
  occupiedUnits: z.number().int().nonnegative(),
  status: propertyStatusSchema,
});

export const tenantSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export const leaseStatusSchema = z.enum(["draft", "active", "notice", "ended"]);

export const leaseSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
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

export const propertyByIdInputSchema = z.object({
  id: z.string().uuid(),
});

export type Address = z.infer<typeof addressSchema>;
export type Property = z.infer<typeof propertySchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Lease = z.infer<typeof leaseSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;
