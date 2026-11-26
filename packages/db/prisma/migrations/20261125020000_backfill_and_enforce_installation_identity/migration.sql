BEGIN;

ALTER TABLE "Installation"
ADD CONSTRAINT "Installation_singleton_id_check" CHECK ("id" = 'installation');

-- Fresh installations initialize their identity during account setup.
INSERT INTO "Installation" ("id", "installationId")
SELECT 'installation', gen_random_uuid()::text
WHERE EXISTS (SELECT 1 FROM "User")
ON CONFLICT ("id") DO NOTHING;

COMMIT;
