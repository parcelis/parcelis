WITH "rankedDefaults" AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "id") AS "rank"
    FROM "InvoiceCharge"
    WHERE "isDefault" = true
)
UPDATE "InvoiceCharge" SET "isDefault" = false
WHERE "id" IN (SELECT "id" FROM "rankedDefaults" WHERE "rank" > 1);

CREATE UNIQUE INDEX "InvoiceCharge_one_default_per_organization_key"
ON "InvoiceCharge"("organizationId") WHERE "isDefault" = true;
