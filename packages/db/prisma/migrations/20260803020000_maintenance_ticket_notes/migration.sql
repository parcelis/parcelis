-- AlterTable
ALTER TABLE "Note" ADD COLUMN "maintenanceTicketId" INTEGER;

-- CreateIndex
CREATE INDEX "Note_maintenanceTicketId_createdAt_id_idx" ON "Note"("maintenanceTicketId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
