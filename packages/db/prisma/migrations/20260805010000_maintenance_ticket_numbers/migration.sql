CREATE SEQUENCE "MaintenanceTicket_ticketNumber_seq";

ALTER TABLE "MaintenanceTicket" ADD COLUMN "ticketNumber" INTEGER;

WITH numbered_tickets AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC)::INTEGER AS "ticketNumber"
    FROM "MaintenanceTicket"
)
UPDATE "MaintenanceTicket" AS ticket
SET "ticketNumber" = numbered_tickets."ticketNumber"
FROM numbered_tickets
WHERE ticket."id" = numbered_tickets."id";

SELECT setval(
    '"MaintenanceTicket_ticketNumber_seq"',
    COALESCE((SELECT MAX("ticketNumber") FROM "MaintenanceTicket"), 1),
    EXISTS (SELECT 1 FROM "MaintenanceTicket")
);

ALTER TABLE "MaintenanceTicket"
ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"MaintenanceTicket_ticketNumber_seq"'),
ALTER COLUMN "ticketNumber" SET NOT NULL;

ALTER SEQUENCE "MaintenanceTicket_ticketNumber_seq" OWNED BY "MaintenanceTicket"."ticketNumber";

CREATE UNIQUE INDEX "MaintenanceTicket_ticketNumber_key" ON "MaintenanceTicket"("ticketNumber");
