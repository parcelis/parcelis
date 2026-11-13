ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'lease_notes';

ALTER TABLE "Note" ADD COLUMN "leaseId" INTEGER;

ALTER TABLE "Note" DROP CONSTRAINT "Note_exactly_one_subject";

ALTER TABLE "Note" ADD CONSTRAINT "Note_exactly_one_subject" CHECK (
    (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "unitId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "maintenanceTicketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "applicationId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "invoiceId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "leaseId" IS NULL THEN 0 ELSE 1 END) = 1
);

ALTER TABLE "Note" ADD CONSTRAINT "Note_leaseId_fkey"
    FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Note_leaseId_createdAt_id_idx" ON "Note"("leaseId", "createdAt", "id");

ALTER TABLE "Lease" ADD COLUMN "renewedFromId" INTEGER;
CREATE UNIQUE INDEX "Lease_renewedFromId_key" ON "Lease"("renewedFromId");
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_renewedFromId_fkey"
  FOREIGN KEY ("renewedFromId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
