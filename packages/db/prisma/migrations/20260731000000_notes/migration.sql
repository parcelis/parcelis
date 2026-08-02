CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "propertyId" INTEGER,
    "unitId" INTEGER,
    "tenantId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Note_exactly_one_subject" CHECK (
        (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN "unitId" IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END) = 1
    )
);

CREATE INDEX "Note_propertyId_createdAt_id_idx" ON "Note"("propertyId", "createdAt", "id")
    WHERE "propertyId" IS NOT NULL;
CREATE INDEX "Note_unitId_createdAt_id_idx" ON "Note"("unitId", "createdAt", "id")
    WHERE "unitId" IS NOT NULL;
CREATE INDEX "Note_tenantId_createdAt_id_idx" ON "Note"("tenantId", "createdAt", "id")
    WHERE "tenantId" IS NOT NULL;

ALTER TABLE "Note" ADD CONSTRAINT "Note_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD CONSTRAINT "Note_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD CONSTRAINT "Note_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Note" ("body", "propertyId", "createdAt", "updatedAt")
SELECT "notes", "id", "createdAt", "updatedAt"
FROM "Property"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';

INSERT INTO "Note" ("body", "tenantId", "createdAt", "updatedAt")
SELECT "notes", "id", "createdAt", "updatedAt"
FROM "Tenant"
WHERE "notes" IS NOT NULL AND btrim("notes") <> '';
