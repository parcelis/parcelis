ALTER TABLE "User" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'User';

INSERT INTO "User" ("name", "email", "passwordHash", "updatedAt")
VALUES (
    'Administrator',
    'admin@parcelis.dev',
    '$argon2id$v=19$m=19456,p=1,t=2$q4Y0Ni3WWW5QtSof6IsAog$ERfpMiBoXk18KQchfOOfeWhIK6MhUl2/QCh0B7ef0bE',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE
SET "name" = EXCLUDED."name", "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = CURRENT_TIMESTAMP;
