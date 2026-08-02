DROP INDEX "Note_propertyId_createdAt_idx";
DROP INDEX "Note_unitId_createdAt_idx";
DROP INDEX "Note_tenantId_createdAt_idx";

CREATE INDEX "Note_propertyId_createdAt_id_idx" ON "Note"("propertyId", "createdAt", "id")
    WHERE "propertyId" IS NOT NULL;
CREATE INDEX "Note_unitId_createdAt_id_idx" ON "Note"("unitId", "createdAt", "id")
    WHERE "unitId" IS NOT NULL;
CREATE INDEX "Note_tenantId_createdAt_id_idx" ON "Note"("tenantId", "createdAt", "id")
    WHERE "tenantId" IS NOT NULL;

INSERT INTO "Note" ("body", "propertyId", "createdAt", "updatedAt")
SELECT "notes", "id", "createdAt", "updatedAt"
FROM "Property"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';

INSERT INTO "Note" ("body", "tenantId", "createdAt", "updatedAt")
SELECT "notes", "id", "createdAt", "updatedAt"
FROM "Tenant"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';
