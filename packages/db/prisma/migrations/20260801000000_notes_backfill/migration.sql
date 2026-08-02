DROP INDEX "Note_propertyId_createdAt_idx";
DROP INDEX "Note_unitId_createdAt_idx";
DROP INDEX "Note_tenantId_createdAt_idx";

CREATE INDEX "Note_propertyId_createdAt_id_idx" ON "Note"("propertyId", "createdAt", "id")
    WHERE "propertyId" IS NOT NULL;
CREATE INDEX "Note_unitId_createdAt_id_idx" ON "Note"("unitId", "createdAt", "id")
    WHERE "unitId" IS NOT NULL;
CREATE INDEX "Note_tenantId_createdAt_id_idx" ON "Note"("tenantId", "createdAt", "id")
    WHERE "tenantId" IS NOT NULL;

ALTER TABLE "Property" ADD COLUMN "legacyNoteId" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "legacyNoteId" INTEGER;

CREATE UNIQUE INDEX "Property_legacyNoteId_key" ON "Property"("legacyNoteId");
CREATE UNIQUE INDEX "Tenant_legacyNoteId_key" ON "Tenant"("legacyNoteId");

WITH inserted_notes AS (
    INSERT INTO "Note" ("body", "propertyId", "createdAt", "updatedAt")
    SELECT "notes", "id", "createdAt", "updatedAt"
    FROM "Property"
    WHERE "notes" IS NOT NULL AND btrim("notes") <> ''
    RETURNING "id", "propertyId"
)
UPDATE "Property" AS property
SET "legacyNoteId" = inserted_notes."id"
FROM inserted_notes
WHERE property."id" = inserted_notes."propertyId";

WITH inserted_notes AS (
    INSERT INTO "Note" ("body", "tenantId", "createdAt", "updatedAt")
    SELECT "notes", "id", "createdAt", "updatedAt"
    FROM "Tenant"
    WHERE "notes" IS NOT NULL AND btrim("notes") <> ''
    RETURNING "id", "tenantId"
)
UPDATE "Tenant" AS tenant
SET "legacyNoteId" = inserted_notes."id"
FROM inserted_notes
WHERE tenant."id" = inserted_notes."tenantId";

ALTER TABLE "Property" ADD CONSTRAINT "Property_legacyNoteId_fkey"
    FOREIGN KEY ("legacyNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_legacyNoteId_fkey"
    FOREIGN KEY ("legacyNoteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
