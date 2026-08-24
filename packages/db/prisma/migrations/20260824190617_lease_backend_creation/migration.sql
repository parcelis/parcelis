-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organizationId_paidByTenantId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organizationId_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organizationId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_propertyId_fkey";

-- DropIndex
DROP INDEX "Invoice_id_tenantId_key";

-- DropIndex
DROP INDEX "Invoice_leaseId_periodStartsOn_key";

-- DropIndex
DROP INDEX "Invoice_organizationId_id_tenantId_key";

-- CreateIndex
CREATE INDEX "Invoice_leaseId_idx" ON "Invoice"("leaseId");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidByTenantId_fkey" FOREIGN KEY ("paidByTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
