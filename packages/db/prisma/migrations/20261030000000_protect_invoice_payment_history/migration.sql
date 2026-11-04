ALTER TABLE "InvoicePayment"
DROP CONSTRAINT "InvoicePayment_invoiceId_fkey",
ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment"
DROP CONSTRAINT "InvoicePayment_organizationId_invoiceId_tenantId_fkey",
ADD CONSTRAINT "InvoicePayment_organizationId_invoiceId_tenantId_fkey"
FOREIGN KEY ("organizationId", "invoiceId", "tenantId")
REFERENCES "InvoiceRecipient"("organizationId", "invoiceId", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
