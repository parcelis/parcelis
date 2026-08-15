-- Ambiguous legacy requester rows require manual reconciliation before migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MaintenanceTicket"
    WHERE "requestedByType" IS NULL
      AND "requestedByTenantId" IS NOT NULL
      AND "requestedByLandlordId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Ambiguous maintenance ticket requester rows require manual reconciliation';
  END IF;
END $$;

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
CHECK ((
  ("requestedByType" IS NULL AND "requestedByTenantId" IS NULL AND "requestedByLandlordId" IS NULL)
  OR ("requestedByType" = 'tenant' AND "requestedByTenantId" IS NOT NULL AND "requestedByLandlordId" IS NULL)
  OR ("requestedByType" = 'landlord' AND "requestedByTenantId" IS NULL AND "requestedByLandlordId" IS NOT NULL)
) IS TRUE);

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

CREATE FUNCTION "validateUnitOrganizationUpdate"() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "UnitUtility" utility
    JOIN "UtilityType" option ON option."id" = utility."optionId"
    JOIN "Property" property ON property."id" = NEW."propertyId"
    WHERE utility."unitId" = NEW."id" AND option."organizationId" <> property."organizationId"
  ) OR EXISTS (
    SELECT 1 FROM "UnitAmenity" amenity
    JOIN "AmenityType" option ON option."id" = amenity."optionId"
    JOIN "Property" property ON property."id" = NEW."propertyId"
    WHERE amenity."unitId" = NEW."id" AND option."organizationId" <> property."organizationId"
  ) OR EXISTS (
    SELECT 1 FROM "MaintenanceTicketUnit" ticketUnit
    JOIN "MaintenanceTicket" ticket ON ticket."id" = ticketUnit."ticketId"
    JOIN "Property" property ON property."id" = NEW."propertyId"
    WHERE ticketUnit."unitId" = NEW."id" AND ticket."organizationId" <> property."organizationId"
  ) THEN
    RAISE EXCEPTION 'Unit reassignment would create a cross-organization association' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Unit_organization_update_check"
BEFORE UPDATE OF "propertyId" ON "Unit"
FOR EACH ROW EXECUTE FUNCTION "validateUnitOrganizationUpdate"();

CREATE FUNCTION "validatePropertyOrganizationUpdate"() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Unit" unit
    JOIN "UnitUtility" utility ON utility."unitId" = unit."id"
    JOIN "UtilityType" option ON option."id" = utility."optionId"
    WHERE unit."propertyId" = NEW."id" AND option."organizationId" <> NEW."organizationId"
  ) OR EXISTS (
    SELECT 1 FROM "Unit" unit
    JOIN "UnitAmenity" amenity ON amenity."unitId" = unit."id"
    JOIN "AmenityType" option ON option."id" = amenity."optionId"
    WHERE unit."propertyId" = NEW."id" AND option."organizationId" <> NEW."organizationId"
  ) OR EXISTS (
    SELECT 1 FROM "Unit" unit
    JOIN "MaintenanceTicketUnit" ticketUnit ON ticketUnit."unitId" = unit."id"
    JOIN "MaintenanceTicket" ticket ON ticket."id" = ticketUnit."ticketId"
    WHERE unit."propertyId" = NEW."id" AND ticket."organizationId" <> NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Property reassignment would create a cross-organization association' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Property_organization_update_check"
BEFORE UPDATE OF "organizationId" ON "Property"
FOR EACH ROW EXECUTE FUNCTION "validatePropertyOrganizationUpdate"();

CREATE FUNCTION "validateOptionOrganizationUpdate"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'UtilityType' AND EXISTS (
    SELECT 1 FROM "UnitUtility" utility
    JOIN "Unit" unit ON unit."id" = utility."unitId"
    JOIN "Property" property ON property."id" = unit."propertyId"
    WHERE utility."optionId" = NEW."id" AND property."organizationId" <> NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Utility reassignment would create a cross-organization association' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'AmenityType' AND EXISTS (
    SELECT 1 FROM "UnitAmenity" amenity
    JOIN "Unit" unit ON unit."id" = amenity."unitId"
    JOIN "Property" property ON property."id" = unit."propertyId"
    WHERE amenity."optionId" = NEW."id" AND property."organizationId" <> NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Amenity reassignment would create a cross-organization association' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityType_organization_update_check"
BEFORE UPDATE OF "organizationId" ON "UtilityType"
FOR EACH ROW EXECUTE FUNCTION "validateOptionOrganizationUpdate"();

CREATE TRIGGER "AmenityType_organization_update_check"
BEFORE UPDATE OF "organizationId" ON "AmenityType"
FOR EACH ROW EXECUTE FUNCTION "validateOptionOrganizationUpdate"();

CREATE FUNCTION "validateMaintenanceTicketOrganizationUpdate"() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MaintenanceTicketUnit" ticketUnit
    JOIN "Unit" unit ON unit."id" = ticketUnit."unitId"
    JOIN "Property" property ON property."id" = unit."propertyId"
    WHERE ticketUnit."ticketId" = NEW."id" AND property."organizationId" <> NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Maintenance ticket reassignment would create a cross-organization association' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MaintenanceTicket_organization_update_check"
BEFORE UPDATE OF "organizationId" ON "MaintenanceTicket"
FOR EACH ROW EXECUTE FUNCTION "validateMaintenanceTicketOrganizationUpdate"();
