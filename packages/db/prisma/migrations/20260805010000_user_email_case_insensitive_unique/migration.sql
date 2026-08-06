DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY LOWER("email")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive User email uniqueness while duplicate email addresses differing only by case exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX "User_email_lowercase_key" ON "User" (LOWER("email"));
