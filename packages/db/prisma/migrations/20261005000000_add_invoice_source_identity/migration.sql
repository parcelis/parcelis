ALTER TABLE "Invoice"
ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "billingRevision" INTEGER;

CREATE UNIQUE INDEX "Invoice_organizationId_leaseId_sourceKey_key"
ON "Invoice"("organizationId", "leaseId", "sourceKey");
