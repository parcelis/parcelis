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
       CASE WHEN i."hasPaymentHistory" AND i."balanceCents" = 0 AND i."paidOn" IS NOT NULL
              THEN LEAST(i."dueOn", i."paidOn" - INTERVAL '1 millisecond')
            WHEN i."hasPaymentHistory" THEN i."dueOn"
            ELSE COALESCE(i."paidOn", i."dueOn") END,
       CURRENT_TIMESTAMP
FROM missing_payments i
WHERE i."missingPaidCents" > 0;

WITH latest_payments AS (
  SELECT DISTINCT ON (p."organizationId", p."invoiceId")
         p."organizationId", p."invoiceId", p."paidOn", p."tenantId", p."paymentMethod"
  FROM "InvoicePayment" p
  WHERE p."reversedAt" IS NULL
  ORDER BY p."organizationId", p."invoiceId", p."paidOn" DESC, p."id" DESC
)
UPDATE "Invoice" i
SET "paidOn" = COALESCE(i."paidOn", p."paidOn"),
    "paidByTenantId" = COALESCE(i."paidByTenantId", p."tenantId"),
    "paymentMethod" = COALESCE(i."paymentMethod", p."paymentMethod")
FROM latest_payments p
WHERE p."organizationId" = i."organizationId"
  AND p."invoiceId" = i."id"
  AND i."balanceCents" = 0
  AND i."status" <> 'void'
  AND (i."paidOn" IS NULL OR i."paidByTenantId" IS NULL OR i."paymentMethod" IS NULL);

UPDATE "Invoice"
SET "status" = 'paid'
WHERE "balanceCents" = 0
  AND "status" IN ('open', 'overdue');
