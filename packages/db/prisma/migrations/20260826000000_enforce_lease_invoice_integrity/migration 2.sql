-- Scope every lease to a unit on the same property.
CREATE UNIQUE INDEX "Unit_propertyId_id_key" ON "Unit"("propertyId", "id");
CREATE UNIQUE INDEX "Lease_organizationId_id_key" ON "Lease"("organizationId", "id");
CREATE UNIQUE INDEX "Lease_organizationId_id_propertyId_key" ON "Lease"("organizationId", "id", "propertyId");

ALTER TABLE "Lease" DROP CONSTRAINT "Lease_unitId_fkey";
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_propertyId_unitId_fkey"
FOREIGN KEY ("propertyId", "unitId") REFERENCES "Unit"("propertyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing associations while making the organization part of their key.
ALTER TABLE "LeaseTenant" ADD COLUMN "organizationId" INTEGER;
UPDATE "LeaseTenant" AS lease_tenant
SET "organizationId" = lease."organizationId"
FROM "Lease" AS lease
WHERE lease."id" = lease_tenant."leaseId";
ALTER TABLE "LeaseTenant" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LeaseTenant" DROP CONSTRAINT "LeaseTenant_leaseId_fkey";
ALTER TABLE "LeaseTenant" DROP CONSTRAINT "LeaseTenant_tenantId_fkey";
ALTER TABLE "LeaseTenant" DROP CONSTRAINT "LeaseTenant_pkey";
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_pkey" PRIMARY KEY ("organizationId", "leaseId", "tenantId");
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_organizationId_leaseId_fkey"
FOREIGN KEY ("organizationId", "leaseId") REFERENCES "Lease"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaseTenant" ADD CONSTRAINT "LeaseTenant_organizationId_tenantId_fkey"
FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep invoices tied to the lease's organization and property, a tenant on that lease, and a payer in that organization.
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_leaseId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_propertyId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_tenantId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_paidByTenantId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_leaseId_propertyId_fkey"
FOREIGN KEY ("organizationId", "leaseId", "propertyId") REFERENCES "Lease"("organizationId", "id", "propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_tenantId_fkey"
FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_paidByTenantId_fkey"
FOREIGN KEY ("organizationId", "paidByTenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE SET NULL ("paidByTenantId") ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_leaseId_tenantId_fkey"
FOREIGN KEY ("organizationId", "leaseId", "tenantId") REFERENCES "LeaseTenant"("organizationId", "leaseId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- A payment's tenant must match its invoice tenant.
CREATE UNIQUE INDEX "Invoice_id_tenantId_key" ON "Invoice"("id", "tenantId");
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_invoiceId_fkey";
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_tenantId_fkey"
FOREIGN KEY ("invoiceId", "tenantId") REFERENCES "Invoice"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
