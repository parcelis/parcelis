ALTER TABLE "Invoice" ADD COLUMN "paidByTenantId" INTEGER;
CREATE INDEX "Invoice_paidByTenantId_idx" ON "Invoice"("paidByTenantId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidByTenantId_fkey" FOREIGN KEY ("paidByTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
