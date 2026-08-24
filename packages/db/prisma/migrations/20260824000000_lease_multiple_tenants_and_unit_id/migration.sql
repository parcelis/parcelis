-- AlterTable
ALTER TABLE "Lease" DROP COLUMN "tenantId",
DROP COLUMN "unitLabel",
DROP COLUMN "amountOverdueCents",
ADD COLUMN "unitId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "LeaseTenant" (
    "leaseId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("leaseId","tenantId")
);

-- CreateIndex
CREATE INDEX "LeaseTenant_tenantId_idx" ON "LeaseTenant"("tenantId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "propertyId" INTEGER;

-- Update existing invoices to get propertyId from Lease
UPDATE "Invoice" SET "propertyId" = (SELECT "propertyId" FROM "Lease" WHERE "Lease"."id" = "Invoice"."leaseId");

-- Make propertyId NOT NULL after populating it
ALTER TABLE "Invoice" ALTER COLUMN "propertyId" SET NOT NULL;

-- DropForeignKey (old complex foreign key)
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_lease_fkey";

-- AddForeignKey (new simple foreign key)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_lease_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON UPDATE CASCADE;

-- Remove unique constraints that referenced tenantId
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_id_tenantId_key";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_organizationId_id_tenantId_key";

-- Add new unique constraint
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_leaseId_periodStartsOn_key";
CREATE UNIQUE INDEX "Invoice_leaseId_tenantId_periodStartsOn_key" ON "Invoice"("leaseId", "tenantId", "periodStartsOn");

-- Fix InvoicePayment foreign key
ALTER TABLE "InvoicePayment" DROP CONSTRAINT IF EXISTS "InvoicePayment_invoiceId_tenantId_fkey";
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
