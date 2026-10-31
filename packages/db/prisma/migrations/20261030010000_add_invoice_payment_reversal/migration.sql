ALTER TABLE "InvoicePayment"
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversedById" TEXT,
ADD COLUMN "reversedByName" TEXT,
ADD COLUMN "reversalReason" TEXT;
