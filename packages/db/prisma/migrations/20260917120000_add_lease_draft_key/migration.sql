ALTER TABLE "Lease" ADD COLUMN "leaseDraftKey" TEXT;

UPDATE "Lease"
SET "leaseDraftKey" = gen_random_uuid()::text
WHERE "leaseDraftKey" IS NULL;

ALTER TABLE "Lease" ALTER COLUMN "leaseDraftKey" SET NOT NULL;

CREATE UNIQUE INDEX "Lease_organizationId_leaseDraftKey_key"
ON "Lease"("organizationId", "leaseDraftKey");
