CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "propertyId" INTEGER,
    "unitId" INTEGER,
    "tenantId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Note_exactly_one_subject" CHECK (
        (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN "unitId" IS NULL THEN 0 ELSE 1 END) +
        (CASE WHEN "tenantId" IS NULL THEN 0 ELSE 1 END) = 1
    )
);

CREATE INDEX "Note_propertyId_createdAt_idx" ON "Note"("propertyId", "createdAt");
CREATE INDEX "Note_unitId_createdAt_idx" ON "Note"("unitId", "createdAt");
CREATE INDEX "Note_tenantId_createdAt_idx" ON "Note"("tenantId", "createdAt");

ALTER TABLE "Note" ADD CONSTRAINT "Note_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD CONSTRAINT "Note_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD CONSTRAINT "Note_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
