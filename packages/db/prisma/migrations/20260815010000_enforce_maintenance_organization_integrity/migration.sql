-- Normalize legacy requester rows before requiring a consistent discriminator.
UPDATE "MaintenanceTicket"
SET
  "requestedByType" = NULL,
  "requestedByTenantId" = NULL,
  "requestedByLandlordId" = NULL
WHERE "requestedByType" IS NULL
  AND "requestedByTenantId" IS NOT NULL
  AND "requestedByLandlordId" IS NOT NULL;

UPDATE "MaintenanceTicket"
SET "requestedByLandlordId" = NULL
WHERE "requestedByType" = 'tenant'
  AND "requestedByTenantId" IS NOT NULL;

UPDATE "MaintenanceTicket"
SET "requestedByTenantId" = NULL
WHERE "requestedByType" = 'landlord'
  AND "requestedByLandlordId" IS NOT NULL;

UPDATE "MaintenanceTicket"
SET "requestedByType" = 'tenant'
WHERE "requestedByType" IS NULL
  AND "requestedByTenantId" IS NOT NULL
  AND "requestedByLandlordId" IS NULL;

UPDATE "MaintenanceTicket"
SET "requestedByType" = 'landlord'
WHERE "requestedByType" IS NULL
  AND "requestedByTenantId" IS NULL
  AND "requestedByLandlordId" IS NOT NULL;

UPDATE "MaintenanceTicket"
SET "requestedByType" = NULL,
  "requestedByTenantId" = NULL,
  "requestedByLandlordId" = NULL
WHERE ("requestedByType" = 'tenant' AND "requestedByTenantId" IS NULL)
   OR ("requestedByType" = 'landlord' AND "requestedByLandlordId" IS NULL)
   OR ("requestedByType" IS NULL
       AND ("requestedByTenantId" IS NOT NULL OR "requestedByLandlordId" IS NOT NULL));

ALTER TABLE "MaintenanceTicket"
ADD CONSTRAINT "MaintenanceTicket_requester_discriminator_check"
CHECK (
  ("requestedByType" IS NULL AND "requestedByTenantId" IS NULL AND "requestedByLandlordId" IS NULL)
  OR ("requestedByType" = 'tenant' AND "requestedByTenantId" IS NOT NULL AND "requestedByLandlordId" IS NULL)
  OR ("requestedByType" = 'landlord' AND "requestedByTenantId" IS NULL AND "requestedByLandlordId" IS NOT NULL)
);

ALTER TABLE "MaintenanceTicket"
DROP CONSTRAINT "MaintenanceTicket_organizationId_requestedByTenantId_fkey",
DROP CONSTRAINT "MaintenanceTicket_organizationId_requestedByLandlordId_fkey";

ALTER TABLE "MaintenanceTicket"
ADD CONSTRAINT "MaintenanceTicket_organizationId_requestedByTenantId_fkey"
FOREIGN KEY ("organizationId", "requestedByTenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "MaintenanceTicket_organizationId_requestedByLandlordId_fkey"
FOREIGN KEY ("organizationId", "requestedByLandlordId") REFERENCES "Landlord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validateMaintenanceTicketUnitOrganization"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "MaintenanceTicket" AS ticket
    JOIN "Unit" AS unit ON unit."id" = NEW."unitId"
    JOIN "Property" AS property ON property."id" = unit."propertyId"
    WHERE ticket."id" = NEW."ticketId"
      AND ticket."organizationId" = property."organizationId"
  ) THEN
    RAISE EXCEPTION 'Maintenance ticket units must belong to the ticket organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MaintenanceTicketUnit_organization_check"
BEFORE INSERT OR UPDATE OF "ticketId", "unitId" ON "MaintenanceTicketUnit"
FOR EACH ROW EXECUTE FUNCTION "validateMaintenanceTicketUnitOrganization"();

CREATE FUNCTION "validateUnitUtilityOrganization"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Unit" AS unit
    JOIN "Property" AS property ON property."id" = unit."propertyId"
    JOIN "UtilityType" AS option ON option."id" = NEW."optionId"
    WHERE unit."id" = NEW."unitId"
      AND property."organizationId" = option."organizationId"
  ) THEN
    RAISE EXCEPTION 'Unit utilities must belong to the unit organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitUtility_organization_check"
BEFORE INSERT OR UPDATE OF "unitId", "optionId" ON "UnitUtility"
FOR EACH ROW EXECUTE FUNCTION "validateUnitUtilityOrganization"();

CREATE FUNCTION "validateUnitAmenityOrganization"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "Unit" AS unit
    JOIN "Property" AS property ON property."id" = unit."propertyId"
    JOIN "AmenityType" AS option ON option."id" = NEW."optionId"
    WHERE unit."id" = NEW."unitId"
      AND property."organizationId" = option."organizationId"
  ) THEN
    RAISE EXCEPTION 'Unit amenities must belong to the unit organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UnitAmenity_organization_check"
BEFORE INSERT OR UPDATE OF "unitId", "optionId" ON "UnitAmenity"
FOR EACH ROW EXECUTE FUNCTION "validateUnitAmenityOrganization"();
