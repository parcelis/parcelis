DELETE FROM "Note" AS note
USING "Property" AS property
WHERE note."id" = property."legacyNoteId"
  AND property."notes" ~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$';

UPDATE "Property"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL
  AND "notes" ~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$';

DELETE FROM "Note" AS note
USING "Tenant" AS tenant
WHERE note."id" = tenant."legacyNoteId"
  AND tenant."notes" ~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$';

UPDATE "Tenant"
SET "notes" = NULL, "legacyNoteId" = NULL
WHERE "notes" IS NOT NULL
  AND "notes" ~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$';
