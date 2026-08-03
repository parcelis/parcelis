-- CreateEnum
CREATE TYPE "MaintenanceTicketStatus_new" AS ENUM ('new', 'in_progress', 'pending', 'resolved', 'closed', 'canceled');

-- AlterTable
ALTER TABLE "MaintenanceTicket" ADD COLUMN "archivedAt" TIMESTAMP(3),
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "MaintenanceTicketStatus_new" USING (
  CASE "status"::text
    WHEN 'open' THEN 'new'
    WHEN 'waiting_vendor' THEN 'pending'
    ELSE "status"::text
  END::"MaintenanceTicketStatus_new"
),
ALTER COLUMN "status" SET DEFAULT 'new';

-- DropEnum
DROP TYPE "MaintenanceTicketStatus";
ALTER TYPE "MaintenanceTicketStatus_new" RENAME TO "MaintenanceTicketStatus";
