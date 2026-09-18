/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LeaseBillingResponsibility" AS ENUM ('joint', 'individual');

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "allowPartialPayments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "billingResponsibility" "LeaseBillingResponsibility",
ADD COLUMN     "securityDepositCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LeaseTenant" ADD COLUMN     "depositShareCents" INTEGER,
ADD COLUMN     "rentShareCents" INTEGER;

-- CreateTable
CREATE TABLE "InvoiceRecipient" (
    "organizationId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRecipient_pkey" PRIMARY KEY ("organizationId","invoiceId","tenantId")
);

-- CreateIndex
CREATE INDEX "InvoiceRecipient_invoiceId_idx" ON "InvoiceRecipient"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceRecipient_tenantId_idx" ON "InvoiceRecipient"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_id_key" ON "Invoice"("organizationId", "id");

-- BackfillInvoiceRecipients
INSERT INTO "InvoiceRecipient" ("organizationId", "invoiceId", "tenantId")
SELECT "organizationId", "id", "tenantId"
FROM "Invoice"
ON CONFLICT DO NOTHING;

-- AddForeignKey
ALTER TABLE "InvoiceRecipient" ADD CONSTRAINT "InvoiceRecipient_organizationId_invoiceId_fkey" FOREIGN KEY ("organizationId", "invoiceId") REFERENCES "Invoice"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecipient" ADD CONSTRAINT "InvoiceRecipient_organizationId_tenantId_fkey" FOREIGN KEY ("organizationId", "tenantId") REFERENCES "Tenant"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRecipient" ADD CONSTRAINT "InvoiceRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
