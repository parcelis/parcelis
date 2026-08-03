ALTER TABLE "Property" RENAME CONSTRAINT "Property_legacyNoteId_subject_fkey" TO "Property_id_legacyNoteId_fkey";
ALTER TABLE "Tenant" RENAME CONSTRAINT "Tenant_legacyNoteId_subject_fkey" TO "Tenant_id_legacyNoteId_fkey";
