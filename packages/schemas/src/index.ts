import { z } from "zod";
import { LeaseStatus } from "@parcelis/db";

const idSchema = z.coerce.number().int().positive();

export const authCredentialsInputSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(1024),
});

export const authLoginInputSchema = authCredentialsInputSchema;
export const authRegisterInputSchema = authCredentialsInputSchema;

export const userRoleSchema = z.enum(["administrator", "member"]);
export const userAccountStatusSchema = z.enum(["active", "disabled"]);
export const updateUserInputSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  phone: z.string().trim().max(50).nullable(),
  role: userRoleSchema,
});
export const userAccountStatusInputSchema = z.object({
  id: idSchema,
  accountStatus: userAccountStatusSchema,
});
export const deleteUserInputSchema = z.object({ id: idSchema });

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

const propertyNoteSubjectSchema = z.object({ propertyId: idSchema }).strict();
const unitNoteSubjectSchema = z.object({ unitId: idSchema }).strict();
const tenantNoteSubjectSchema = z.object({ tenantId: idSchema }).strict();
const maintenanceTicketNoteSubjectSchema = z.object({ maintenanceTicketId: idSchema }).strict();
const noteSubjectSchemas = [
  propertyNoteSubjectSchema,
  unitNoteSubjectSchema,
  tenantNoteSubjectSchema,
  maintenanceTicketNoteSubjectSchema,
] as const;

export const noteSubjectInputSchema = z.union(noteSubjectSchemas);

export const noteListInputSchema = z.union(
  noteSubjectSchemas.map((schema) => schema.extend({ limit: z.number().int().min(1).max(100).default(50) })),
);

export const createNoteInputSchema = z.union(
  noteSubjectSchemas.map((schema) => schema.extend({ body: z.string().trim().min(1).max(5000) })),
);

export const updateNoteInputSchema = z.object({
  id: idSchema,
  body: z.string().trim().min(1).max(5000),
});

export const deleteNoteInputSchema = z.object({
  id: idSchema,
});

const legacyNotesSchema = z.string().trim().max(5000).optional();

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
  notes: legacyNotesSchema,
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

export const createMaintenanceTicketInputSchema = z.object({
  ticketTitle: z.string().trim().min(1).max(200),
  propertyId: idSchema,
  unitIds: z.array(idSchema).max(50).default([]),
  categoryId: idSchema,
  description: z.string().trim().max(5000).optional(),
  requestedById: idSchema,
  requestedByType: z.enum(["tenant", "landlord"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  isUrgent: z.boolean().default(false),
  consentToEnter: z.boolean().default(false),
});
export const updateMaintenanceTicketInputSchema = createMaintenanceTicketInputSchema.extend({ id: idSchema });

export const maintenanceTicketByIdInputSchema = z.object({ id: idSchema });
export const maintenanceTicketStatuses = [
  "new",
  "in_progress",
  "pending",
  "scheduled",
  "resolved",
  "closed",
  "canceled",
] as const;
export const activeMaintenanceTicketStatuses = ["new", "in_progress", "pending", "scheduled"] as const;
export const terminalMaintenanceTicketStatuses = ["resolved", "closed", "canceled"] as const;
export const maintenanceTicketStatusSchema = z.enum(maintenanceTicketStatuses);

export function isActiveMaintenanceTicketStatus(status: string) {
  return activeMaintenanceTicketStatuses.includes(status as (typeof activeMaintenanceTicketStatuses)[number]);
}

export function isTerminalMaintenanceTicketStatus(status: string) {
  return terminalMaintenanceTicketStatuses.includes(status as (typeof terminalMaintenanceTicketStatuses)[number]);
}
export const updateMaintenanceTicketStatusInputSchema = z.object({
  id: idSchema,
  noteBody: z.string().trim().min(1).max(5000).optional(),
  status: maintenanceTicketStatusSchema,
});
export const activitySubjectTypes = ["maintenance_ticket", "tenant", "property", "invoice"] as const;
export const activitySubjectTypeSchema = z.enum(activitySubjectTypes);
export const activityEventListInputSchema = z.object({
  subjectType: activitySubjectTypeSchema.optional(),
  subjectId: idSchema.optional(),
  propertyId: idSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).refine(({ subjectType, subjectId }) => Boolean(subjectType) === Boolean(subjectId), {
  message: "Subject type and subject ID must be provided together.",
  path: ["subjectId"],
});
export const maintenanceImageUploadInputSchema = z.object({
  id: idSchema,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileName: z.string().trim().min(1).max(255),
});
export const maintenanceImageUploadCompleteInputSchema = z
  .object({
    id: idSchema,
    fileName: z.string().trim().min(1).max(255),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    objectKey: z.string().regex(/^maintenance\/\d+\/images\/[a-f0-9-]+\.(jpg|png|webp)$/),
  })
  .refine(({ id, objectKey }) => objectKey.startsWith(`maintenance/${id}/images/`), {
    message: "The image must belong to the selected maintenance ticket.",
    path: ["objectKey"],
  });
export const maintenanceAttachmentByIdInputSchema = z.object({ id: idSchema });

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
  notes: legacyNotesSchema,
});

export const propertyNotesInputSchema = z.object({
  id: idSchema,
  notes: legacyNotesSchema,
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
export type CreateMaintenanceTicketInput = z.infer<typeof createMaintenanceTicketInputSchema>;
export type MaintenanceImageUploadInput = z.infer<typeof maintenanceImageUploadInputSchema>;
export type MaintenanceImageUploadCompleteInput = z.infer<typeof maintenanceImageUploadCompleteInputSchema>;
export type PropertyImageUploadInput = z.infer<typeof propertyImageUploadInputSchema>;
export type PropertyImageUploadCompleteInput = z.infer<typeof propertyImageUploadCompleteInputSchema>;
