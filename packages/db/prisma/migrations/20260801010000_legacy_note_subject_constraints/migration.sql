ALTER TABLE "Property" DROP CONSTRAINT "Property_legacyNoteId_fkey";
ALTER TABLE "Tenant" DROP CONSTRAINT "Tenant_legacyNoteId_fkey";

DROP INDEX "Property_legacyNoteId_key";
DROP INDEX "Tenant_legacyNoteId_key";

CREATE UNIQUE INDEX "Note_propertyId_id_key" ON "Note"("propertyId", "id");
CREATE UNIQUE INDEX "Note_tenantId_id_key" ON "Note"("tenantId", "id");

ALTER TABLE "Property" ADD CONSTRAINT "Property_legacyNoteId_subject_fkey"
    FOREIGN KEY ("id", "legacyNoteId") REFERENCES "Note"("propertyId", "id")
    ON DELETE SET NULL ("legacyNoteId") ON UPDATE CASCADE;
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_legacyNoteId_subject_fkey"
    FOREIGN KEY ("id", "legacyNoteId") REFERENCES "Note"("tenantId", "id")
    ON DELETE SET NULL ("legacyNoteId") ON UPDATE CASCADE;
