ALTER TABLE "EmergencyContact"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT;

UPDATE "EmergencyContact"
SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = NULLIF(btrim(substring("name" FROM length(split_part("name", ' ', 1)) + 1)), '');

ALTER TABLE "EmergencyContact"
  ALTER COLUMN "firstName" SET NOT NULL,
  DROP COLUMN "name";
