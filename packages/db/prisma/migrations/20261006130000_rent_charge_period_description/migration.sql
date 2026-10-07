UPDATE "InvoiceCharge"
SET "description" = 'Monthly rent for {month} {year}', "updatedAt" = CURRENT_TIMESTAMP
WHERE "isDefault" = true AND "name" = 'Rent' AND "description" = 'Monthly rent';
