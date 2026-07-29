CREATE TABLE "EmergencyContact" (
  "id" SERIAL NOT NULL,
  "tenantId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EmergencyContact" ("tenantId", "name", "phone", "isPrimary", "updatedAt")
SELECT
  "id",
  COALESCE(NULLIF("emergencyContactName", ''), 'Emergency contact'),
  NULLIF("emergencyContactPhone", ''),
  true,
  CURRENT_TIMESTAMP
FROM "Tenant"
WHERE "emergencyContactName" IS NOT NULL OR "emergencyContactPhone" IS NOT NULL;

ALTER TABLE "Tenant"
  DROP COLUMN "emergencyContactName",
  DROP COLUMN "emergencyContactPhone";

CREATE INDEX "EmergencyContact_tenantId_idx" ON "EmergencyContact"("tenantId");

ALTER TABLE "EmergencyContact"
  ADD CONSTRAINT "EmergencyContact_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
