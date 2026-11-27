-- Prior versions did not record when rent invoices were downloaded.
UPDATE "Invoice"
SET "issuedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
WHERE "issuedAt" IS NULL AND "sourceKey" LIKE 'rent:%';
