UPDATE "Property"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL AND btrim("notes") = '';

UPDATE "Tenant"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL AND btrim("notes") = '';
