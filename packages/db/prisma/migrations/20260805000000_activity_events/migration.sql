CREATE TABLE "ActivityEvent" (
    "id" SERIAL NOT NULL,
    "maintenanceTicketId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" "MaintenanceTicketStatus",
    "nextStatus" "MaintenanceTicketStatus",
    "actorId" TEXT,
    "actorLabel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityEvent_maintenanceTicketId_createdAt_id_idx"
ON "ActivityEvent"("maintenanceTicketId", "createdAt", "id");

CREATE INDEX "ActivityEvent_action_createdAt_idx"
ON "ActivityEvent"("action", "createdAt");

ALTER TABLE "ActivityEvent"
ADD CONSTRAINT "ActivityEvent_maintenanceTicketId_fkey"
FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
