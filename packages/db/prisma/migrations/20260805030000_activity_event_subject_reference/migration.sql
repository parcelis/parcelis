ALTER TABLE "ActivityEvent" ADD COLUMN "subjectReference" TEXT;

UPDATE "ActivityEvent" AS event
SET
    "subjectLabel" = ticket."title",
    "subjectReference" = CONCAT('MNT-', LPAD(ticket."ticketNumber"::TEXT, 7, '0'))
FROM "MaintenanceTicket" AS ticket
WHERE event."subjectType" = 'maintenance_ticket'
  AND event."subjectId" = ticket."id";
