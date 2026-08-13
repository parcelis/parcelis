CREATE UNIQUE INDEX "Invoice_id_tenantId_key" ON "Invoice"("id", "tenantId");

ALTER TABLE "InvoicePayment"
ADD CONSTRAINT "InvoicePayment_invoiceId_tenantId_fkey"
FOREIGN KEY ("invoiceId", "tenantId")
REFERENCES "Invoice"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
