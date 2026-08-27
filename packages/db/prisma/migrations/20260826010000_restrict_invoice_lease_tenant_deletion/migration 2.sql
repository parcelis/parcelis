ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_organizationId_leaseId_tenantId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_leaseId_tenantId_fkey"
FOREIGN KEY ("organizationId", "leaseId", "tenantId") REFERENCES "LeaseTenant"("organizationId", "leaseId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
