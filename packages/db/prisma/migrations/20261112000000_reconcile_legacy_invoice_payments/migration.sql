WITH missing_payments AS (
  SELECT i.*,
         EXISTS (
           SELECT 1 FROM "InvoicePayment" p
           WHERE p."organizationId" = i."organizationId" AND p."invoiceId" = i."id"
         ) AS "hasPaymentHistory",
         i."amountCents" - i."balanceCents" - COALESCE((
           SELECT SUM(p."amountCents")
           FROM "InvoicePayment" p
           WHERE p."organizationId" = i."organizationId"
             AND p."invoiceId" = i."id"
             AND p."reversedAt" IS NULL
         ), 0) AS "missingPaidCents"
  FROM "Invoice" i
  WHERE i."status" <> 'void'
    AND i."balanceCents" >= 0
    AND i."balanceCents" < i."amountCents"
)
INSERT INTO "InvoiceRecipient" ("organizationId", "invoiceId", "tenantId")
SELECT i."organizationId", i."id",
       CASE WHEN i."hasPaymentHistory" THEN i."tenantId"
            ELSE COALESCE(i."paidByTenantId", i."tenantId") END
FROM missing_payments i
WHERE i."missingPaidCents" > 0
ON CONFLICT ("organizationId", "invoiceId", "tenantId") DO NOTHING;

WITH missing_payments AS (
  SELECT i.*,
         EXISTS (
           SELECT 1 FROM "InvoicePayment" p
           WHERE p."organizationId" = i."organizationId" AND p."invoiceId" = i."id"
         ) AS "hasPaymentHistory",
         i."amountCents" - i."balanceCents" - COALESCE((
           SELECT SUM(p."amountCents")
           FROM "InvoicePayment" p
           WHERE p."organizationId" = i."organizationId"
             AND p."invoiceId" = i."id"
             AND p."reversedAt" IS NULL
         ), 0) AS "missingPaidCents"
  FROM "Invoice" i
  WHERE i."status" <> 'void'
    AND i."balanceCents" >= 0
    AND i."balanceCents" < i."amountCents"
)
INSERT INTO "InvoicePayment" (
  "organizationId", "invoiceId", "tenantId", "amountCents", "paymentMethod", "paidOn", "createdAt"
)
SELECT i."organizationId", i."id",
       CASE WHEN i."hasPaymentHistory" THEN i."tenantId"
            ELSE COALESCE(i."paidByTenantId", i."tenantId") END,
       i."missingPaidCents",
       CASE WHEN i."hasPaymentHistory" THEN 'other'
            ELSE COALESCE(i."paymentMethod", 'other') END,
       CASE WHEN i."hasPaymentHistory" THEN i."dueOn"
            ELSE COALESCE(i."paidOn", i."dueOn") END,
       CURRENT_TIMESTAMP
FROM missing_payments i
WHERE i."missingPaidCents" > 0;

UPDATE "Invoice"
SET "status" = 'paid'
WHERE "balanceCents" = 0
  AND "status" IN ('open', 'overdue');
