CREATE TABLE "MaintenanceAttachment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceAttachment_objectKey_key" ON "MaintenanceAttachment"("objectKey");
CREATE INDEX "MaintenanceAttachment_ticketId_createdAt_idx" ON "MaintenanceAttachment"("ticketId", "createdAt");

ALTER TABLE "MaintenanceAttachment" ADD CONSTRAINT "MaintenanceAttachment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
