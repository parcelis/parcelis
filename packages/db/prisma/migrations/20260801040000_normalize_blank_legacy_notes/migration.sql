DELETE FROM "Note" AS note
USING "Property" AS property
WHERE note."id" = property."legacyNoteId"
  AND property."notes" ~ '^[[:space:]]*$';

UPDATE "Property"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL AND "notes" ~ '^[[:space:]]*$';

DELETE FROM "Note" AS note
USING "Tenant" AS tenant
WHERE note."id" = tenant."legacyNoteId"
  AND tenant."notes" ~ '^[[:space:]]*$';

UPDATE "Tenant"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL AND "notes" ~ '^[[:space:]]*$';
