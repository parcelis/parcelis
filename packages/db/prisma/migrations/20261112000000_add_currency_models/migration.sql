BEGIN;

ALTER TABLE "Organization"
ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "currencyLockedAt" TIMESTAMP(3);

-- Deleted monetary records cannot be reconstructed, so every legacy organization is locked.
UPDATE "Organization" SET "currencyLockedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "Lease" ADD COLUMN "currencyCode" TEXT;

-- An untouched draft's default zero deposit alone does not bind its currency.
UPDATE "Lease" AS lease
SET "currencyCode" = 'USD'
WHERE lease."status" <> 'draft'
   OR lease."monthlyRentCents" IS NOT NULL
   OR lease."securityDepositCents" <> 0
   OR EXISTS (
     SELECT 1 FROM "LeaseTenant" AS allocation
     WHERE allocation."organizationId" = lease."organizationId"
       AND allocation."leaseId" = lease."id"
       AND (allocation."rentShareCents" IS NOT NULL OR allocation."depositShareCents" IS NOT NULL)
   )
   OR EXISTS (
     SELECT 1 FROM "Invoice" AS invoice
     WHERE invoice."leaseId" = lease."id"
   );

ALTER TABLE "Invoice" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD';

COMMIT;
