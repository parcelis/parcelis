-- Drop old Invoice foreign key constraints first
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_organizationId_leaseId_propertyId_tenantId_fkey";

-- Remove unique constraints that referenced tenantId or old structure
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_id_tenantId_key";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_organizationId_id_tenantId_key";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_leaseId_periodStartsOn_key";

-- Fix InvoicePayment foreign key
ALTER TABLE "InvoicePayment" DROP CONSTRAINT IF EXISTS "InvoicePayment_invoiceId_tenantId_fkey";

-- propertyId already exists, ensure it's populated
UPDATE "Invoice" SET "propertyId" = (SELECT "propertyId" FROM "Lease" WHERE "Lease"."id" = "Invoice"."leaseId") WHERE "propertyId" IS NULL;

-- Add the unit relation before removing the legacy unit label.
ALTER TABLE "Lease" ADD COLUMN "unitId" INTEGER;

-- CreateTable
CREATE TABLE "LeaseTenant" (
    "leaseId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("leaseId","tenantId")
);

-- CreateIndex
CREATE INDEX "LeaseTenant_tenantId_idx" ON "LeaseTenant"("tenantId");

-- Preserve every existing lease/tenant association and resolve its unit within
-- the same property. A missing unit must halt the migration rather than leave a
-- lease with an arbitrary unit.
INSERT INTO "LeaseTenant" ("leaseId", "tenantId")
SELECT "id", "tenantId" FROM "Lease";

UPDATE "Lease" AS lease
SET "unitId" = unit."id"
FROM "Unit" AS unit
WHERE unit."propertyId" = lease."propertyId"
  AND unit."name" = lease."unitLabel";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Lease" WHERE "unitId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate leases: every legacy unit label must match a unit on its property.';
  END IF;
END $$;

ALTER TABLE "Lease" ALTER COLUMN "unitId" SET NOT NULL;

-- Now that both relationships are preserved, remove the denormalized columns.
ALTER TABLE "Lease" DROP COLUMN "tenantId",
DROP COLUMN "unitLabel",
DROP COLUMN "amountOverdueCents";

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (new simple foreign key)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON UPDATE CASCADE;

-- Add new unique constraint
CREATE UNIQUE INDEX "Invoice_leaseId_tenantId_periodStartsOn_key" ON "Invoice"("leaseId", "tenantId", "periodStartsOn");

-- Fix InvoicePayment foreign key
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
