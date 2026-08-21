ALTER TABLE "Note" DROP CONSTRAINT "Note_exactly_one_subject";

ALTER TABLE "Note" ADD CONSTRAINT "Note_exactly_one_subject" CHECK (
    (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "unitId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "maintenanceTicketId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "applicationId" IS NULL THEN 0 ELSE 1 END) = 1
);
