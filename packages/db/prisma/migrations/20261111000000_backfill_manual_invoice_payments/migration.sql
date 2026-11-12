INSERT INTO "InvoicePayment" (
  "organizationId", "invoiceId", "tenantId", "amountCents", "paymentMethod", "paidOn", "createdAt"
)
SELECT i."organizationId", i."id", COALESCE(i."paidByTenantId", i."tenantId"),
       i."amountCents", COALESCE(i."paymentMethod", 'other'), i."paidOn", CURRENT_TIMESTAMP
FROM "Invoice" i
WHERE i."balanceCents" = 0
  AND i."amountCents" > 0
  AND i."paidOn" IS NOT NULL
  AND i."status" = 'paid'
  AND NOT EXISTS (SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId" = i."id");
