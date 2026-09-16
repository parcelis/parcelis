ALTER TABLE "InvoicePayment" ADD COLUMN "organizationId" INTEGER;

UPDATE "InvoicePayment"
SET "organizationId" = "Invoice"."organizationId"
FROM "Invoice"
WHERE "InvoicePayment"."invoiceId" = "Invoice"."id";

ALTER TABLE "InvoicePayment" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_invoiceId_tenantId_fkey";

ALTER TABLE "InvoicePayment"
ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment"
ADD CONSTRAINT "InvoicePayment_organizationId_invoiceId_tenantId_fkey"
FOREIGN KEY ("organizationId", "invoiceId", "tenantId")
REFERENCES "InvoiceRecipient"("organizationId", "invoiceId", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InvoicePayment_organizationId_idx" ON "InvoicePayment"("organizationId");
