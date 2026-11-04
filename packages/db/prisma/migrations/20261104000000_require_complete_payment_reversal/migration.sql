ALTER TABLE "InvoicePayment"
ADD CONSTRAINT "InvoicePayment_complete_reversal" CHECK (
  (
    "reversedAt" IS NULL AND
    "reversedById" IS NULL AND
    "reversedByName" IS NULL AND
    "reversalReason" IS NULL
  ) OR (
    "reversedAt" IS NOT NULL AND
    "reversedById" IS NOT NULL AND
    "reversedByName" IS NOT NULL AND
    "reversalReason" IS NOT NULL
  )
);
