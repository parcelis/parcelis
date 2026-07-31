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

export const noteSubjectInputSchema = z.union([
  z.object({ propertyId: idSchema }),
  z.object({ unitId: idSchema }),
  z.object({ tenantId: idSchema }),
]);

export const createNoteInputSchema = noteSubjectInputSchema.and(z.object({ body: z.string().trim().min(1).max(5000) }));

export const updateNoteInputSchema = z.object({
  id: idSchema,
  body: z.string().trim().min(1).max(5000),
});

export const deleteNoteInputSchema = z.object({
  id: idSchema,
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
  endsOn: z.coerce.date().nullable(),
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

export const tenantByIdInputSchema = z.object({
  id: idSchema,
});

export const tenantImageUploadInputSchema = z.object({
  id: idSchema,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileName: z.string().trim().min(1).max(255),
});

export const tenantImageUploadCompleteInputSchema = z
  .object({
    id: idSchema,
    objectKey: z.string().regex(/^tenants\/\d+\/images\/[a-f0-9-]+\.(jpg|png|webp)$/),
  })
  .strict();

export const updateEmergencyContactInputSchema = z.object({
  id: idSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export const updateTenantInputSchema = z.object({
  id: idSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  emergencyContactFirstName: z.string().trim().optional(),
  emergencyContactLastName: z.string().trim().optional(),
  emergencyContactPhone: z.string().trim().optional(),
  accountStatus: z.enum(["activated", "invitation_pending", "disabled"]),
  insuranceStatus: z.enum(["active", "expired", "not_on_file"]),
});

export const createTenantInputSchema = updateTenantInputSchema.omit({
  id: true,
});

export const tenantNotesInputSchema = z.object({
  id: idSchema,
  notes: z.string().trim().max(5000).optional(),
});

export const propertyNotesInputSchema = z.object({
  id: idSchema,
  notes: z.string().optional(),
});

export const propertyStatusInputSchema = z.object({
  id: idSchema,
});

export const propertyImageUploadInputSchema = z.object({
  id: idSchema,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileName: z.string().trim().min(1).max(255),
});

export const propertyImageUploadCompleteInputSchema = z
  .object({
    id: idSchema,
    objectKey: z.string().regex(/^properties\/\d+\/images\/[a-f0-9-]+\.(jpg|png|webp)$/),
  })
  .refine(({ id, objectKey }) => objectKey.startsWith(`properties/${id}/images/`), {
    message: "The image must belong to the selected property.",
    path: ["objectKey"],
  });

export type Address = z.infer<typeof addressSchema>;
export type Property = z.infer<typeof propertySchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type UnitType = z.infer<typeof unitTypeSchema>;
export type Option = z.infer<typeof optionSchema>;
export type UnitDetailsInput = z.infer<typeof unitDetailsInputSchema>;
export type CreateUnitInput = z.infer<typeof createUnitInputSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitInputSchema>;
export type NoteSubjectInput = z.infer<typeof noteSubjectInputSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Lease = z.infer<typeof leaseSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertyInputSchema>;
export type PropertyImageUploadInput = z.infer<typeof propertyImageUploadInputSchema>;
export type PropertyImageUploadCompleteInput = z.infer<typeof propertyImageUploadCompleteInputSchema>;
