ALTER TABLE "Note" ADD COLUMN "invoiceId" INTEGER;

ALTER TABLE "Note" DROP CONSTRAINT "Note_exactly_one_subject";

ALTER TABLE "Note" ADD CONSTRAINT "Note_exactly_one_subject" CHECK (
    (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "unitId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "maintenanceTicketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "applicationId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "invoiceId" IS NULL THEN 0 ELSE 1 END) = 1
);

ALTER TABLE "Note" ADD CONSTRAINT "Note_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Note_invoiceId_createdAt_id_idx" ON "Note"("invoiceId", "createdAt", "id");
