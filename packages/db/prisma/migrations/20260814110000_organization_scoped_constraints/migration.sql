DROP INDEX "Tag_label_key";
DROP INDEX "UtilityType_label_key";
DROP INDEX "AmenityType_label_key";
DROP INDEX "Tenant_email_key";
DROP INDEX "Landlord_email_key";
DROP INDEX "MaintenanceCategory_label_key";

CREATE UNIQUE INDEX "Tag_organizationId_label_key" ON "Tag"("organizationId", "label");
CREATE UNIQUE INDEX "UtilityType_organizationId_label_key" ON "UtilityType"("organizationId", "label");
CREATE UNIQUE INDEX "AmenityType_organizationId_label_key" ON "AmenityType"("organizationId", "label");
CREATE UNIQUE INDEX "Tenant_organizationId_email_key" ON "Tenant"("organizationId", "email");
CREATE UNIQUE INDEX "Landlord_organizationId_email_key" ON "Landlord"("organizationId", "email");
CREATE UNIQUE INDEX "MaintenanceCategory_organizationId_label_key" ON "MaintenanceCategory"("organizationId", "label");

CREATE UNIQUE INDEX "Property_organizationId_id_key" ON "Property"("organizationId", "id");
CREATE UNIQUE INDEX "Tenant_organizationId_id_key" ON "Tenant"("organizationId", "id");
CREATE UNIQUE INDEX "Landlord_organizationId_id_key" ON "Landlord"("organizationId", "id");
CREATE UNIQUE INDEX "MaintenanceCategory_organizationId_id_key" ON "MaintenanceCategory"("organizationId", "id");
CREATE UNIQUE INDEX "Lease_organizationId_id_propertyId_tenantId_key" ON "Lease"("organizationId", "id", "propertyId", "tenantId");
CREATE UNIQUE INDEX "Invoice_organizationId_id_tenantId_key" ON "Invoice"("organizationId", "id", "tenantId");

ALTER TABLE "Lease" DROP CONSTRAINT "Lease_propertyId_fkey";
ALTER TABLE "Lease" DROP CONSTRAINT "Lease_tenantId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_leaseId_propertyId_tenantId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_propertyId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_tenantId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_paidByTenantId_fkey";
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT "MaintenanceTicket_propertyId_fkey";
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT "MaintenanceTicket_categoryId_fkey";
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT "MaintenanceTicket_requestedByTenantId_fkey";
ALTER TABLE "MaintenanceTicket" DROP CONSTRAINT "MaintenanceTicket_requestedByLandlordId_fkey";
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_propertyId_fkey";

ALTER TABLE "Lease"
ADD CONSTRAINT "Lease_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Lease_organizationId_tenantId_fkey"
FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_organizationId_leaseId_propertyId_tenantId_fkey"
FOREIGN KEY ("organizationId", "leaseId", "propertyId", "tenantId") REFERENCES "Lease"("organizationId", "id", "propertyId", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "Invoice_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Invoice_organizationId_tenantId_fkey"
FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Invoice_organizationId_paidByTenantId_fkey"
FOREIGN KEY ("organizationId", "paidByTenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE SET NULL ("paidByTenantId") ON UPDATE CASCADE;

ALTER TABLE "MaintenanceTicket"
ADD CONSTRAINT "MaintenanceTicket_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "MaintenanceTicket_organizationId_categoryId_fkey"
FOREIGN KEY ("organizationId", "categoryId") REFERENCES "MaintenanceCategory"("organizationId", "id") ON DELETE SET NULL ("categoryId") ON UPDATE CASCADE,
ADD CONSTRAINT "MaintenanceTicket_organizationId_requestedByTenantId_fkey"
FOREIGN KEY ("organizationId", "requestedByTenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE SET NULL ("requestedByTenantId") ON UPDATE CASCADE,
ADD CONSTRAINT "MaintenanceTicket_organizationId_requestedByLandlordId_fkey"
FOREIGN KEY ("organizationId", "requestedByLandlordId") REFERENCES "Landlord"("organizationId", "id") ON DELETE SET NULL ("requestedByLandlordId") ON UPDATE CASCADE;

ALTER TABLE "ActivityEvent"
ADD CONSTRAINT "ActivityEvent_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId") REFERENCES "Property"("organizationId", "id") ON DELETE SET NULL ("propertyId") ON UPDATE CASCADE;
