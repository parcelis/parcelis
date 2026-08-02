CREATE UNIQUE INDEX "Property_id_legacyNoteId_key" ON "Property"("id", "legacyNoteId");
CREATE UNIQUE INDEX "Tenant_id_legacyNoteId_key" ON "Tenant"("id", "legacyNoteId");
