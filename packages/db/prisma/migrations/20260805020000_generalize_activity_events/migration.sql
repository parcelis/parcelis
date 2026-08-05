CREATE TYPE "ActivitySubjectType" AS ENUM ('maintenance_ticket', 'tenant', 'property', 'invoice');

ALTER TABLE "ActivityEvent"
ADD COLUMN "subjectType" "ActivitySubjectType",
ADD COLUMN "subjectId" INTEGER,
ADD COLUMN "subjectLabel" TEXT,
ADD COLUMN "propertyId" INTEGER;

UPDATE "ActivityEvent" AS event
SET
    "subjectType" = 'maintenance_ticket',
    "subjectId" = ticket."id",
    "subjectLabel" = CONCAT('MNT-', LPAD(ticket."ticketNumber"::TEXT, 7, '0'), ' · ', ticket."title"),
    "propertyId" = ticket."propertyId"
FROM "MaintenanceTicket" AS ticket
WHERE ticket."id" = event."maintenanceTicketId";

ALTER TABLE "ActivityEvent"
ALTER COLUMN "subjectType" SET NOT NULL,
ALTER COLUMN "subjectId" SET NOT NULL,
ALTER COLUMN "subjectLabel" SET NOT NULL;

DROP INDEX "ActivityEvent_maintenanceTicketId_createdAt_id_idx";

ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_maintenanceTicketId_fkey";
ALTER TABLE "ActivityEvent" DROP COLUMN "maintenanceTicketId";

CREATE INDEX "ActivityEvent_subjectType_subjectId_createdAt_id_idx"
ON "ActivityEvent"("subjectType", "subjectId", "createdAt", "id");

CREATE INDEX "ActivityEvent_propertyId_createdAt_id_idx"
ON "ActivityEvent"("propertyId", "createdAt", "id");

ALTER TABLE "ActivityEvent"
ADD CONSTRAINT "ActivityEvent_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
