CREATE TABLE "InvoiceCharge" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceCharge_organizationId_id_key" ON "InvoiceCharge"("organizationId", "id");
CREATE INDEX "InvoiceCharge_organizationId_name_idx" ON "InvoiceCharge"("organizationId", "name");
ALTER TABLE "InvoiceCharge" ADD CONSTRAINT "InvoiceCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lease" ADD COLUMN "rentChargeId" INTEGER;
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_organizationId_rentChargeId_fkey" FOREIGN KEY ("organizationId", "rentChargeId") REFERENCES "InvoiceCharge"("organizationId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

INSERT INTO "InvoiceCharge" ("organizationId", "name", "description", "isDefault", "updatedAt")
SELECT "id", 'Rent', 'Monthly rent', true, CURRENT_TIMESTAMP FROM "Organization";

UPDATE "Lease" SET "rentChargeId" = "InvoiceCharge"."id"
FROM "InvoiceCharge"
WHERE "InvoiceCharge"."organizationId" = "Lease"."organizationId"
  AND "InvoiceCharge"."isDefault" = true;
