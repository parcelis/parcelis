DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = '_PropertyToTag_AB_pkey'
      AND conrelid = '"_PropertyToTag"'::regclass
  ) THEN
    ALTER TABLE "_PropertyToTag" ADD CONSTRAINT "_PropertyToTag_AB_pkey" PRIMARY KEY ("A", "B");
  END IF;
END $$;

DROP INDEX IF EXISTS "_PropertyToTag_AB_unique";
