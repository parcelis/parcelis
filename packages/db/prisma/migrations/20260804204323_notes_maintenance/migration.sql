DROP INDEX "Note_propertyId_createdAt_id_idx";
DROP INDEX "Note_unitId_createdAt_id_idx";
DROP INDEX "Note_tenantId_createdAt_id_idx";

CREATE INDEX "Note_propertyId_createdAt_id_idx" ON "Note"("propertyId", "createdAt", "id");
CREATE INDEX "Note_unitId_createdAt_id_idx" ON "Note"("unitId", "createdAt", "id");
CREATE INDEX "Note_tenantId_createdAt_id_idx" ON "Note"("tenantId", "createdAt", "id");
