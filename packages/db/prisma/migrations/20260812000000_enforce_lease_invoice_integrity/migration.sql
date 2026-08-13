CREATE UNIQUE INDEX "Lease_id_propertyId_tenantId_key" ON "Lease"("id", "propertyId", "tenantId");

CREATE UNIQUE INDEX "Lease_one_current_tenancy_per_unit_key"
ON "Lease"("propertyId", "unitLabel")
WHERE "status" IN ('active', 'notice');

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_leaseId_propertyId_tenantId_fkey"
FOREIGN KEY ("leaseId", "propertyId", "tenantId")
REFERENCES "Lease"("id", "propertyId", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
