-- A lease unit association is scoped by property and cannot exist without it.
ALTER TABLE "Lease" DROP CONSTRAINT "Lease_organizationId_propertyId_fkey";

ALTER TABLE "Lease"
ADD CONSTRAINT "Lease_organizationId_propertyId_fkey"
FOREIGN KEY ("organizationId", "propertyId")
REFERENCES "Property"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lease"
ADD CONSTRAINT "Lease_unit_requires_property_check"
CHECK ("unitId" IS NULL OR "propertyId" IS NOT NULL);
