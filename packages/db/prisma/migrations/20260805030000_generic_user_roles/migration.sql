CREATE TYPE "UserRole_new" AS ENUM (
    'administrator',
    'property_manager',
    'lease_manager',
    'maintenance',
    'property_owner',
    'resident_manager'
);

CREATE TABLE "RolePermission_new" (
    "role" "UserRole_new" NOT NULL,
    "propertyAccess" "PropertyAccessLevel" NOT NULL DEFAULT 'none',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_new_pkey" PRIMARY KEY ("role")
);

INSERT INTO "RolePermission_new" ("role", "propertyAccess", "updatedAt")
VALUES
    ('administrator', 'all', CURRENT_TIMESTAMP),
    ('property_manager', COALESCE((SELECT "propertyAccess" FROM "RolePermission" WHERE "role" = 'member'), 'none'), CURRENT_TIMESTAMP),
    ('lease_manager', 'none', CURRENT_TIMESTAMP),
    ('maintenance', COALESCE((SELECT "propertyAccess" FROM "RolePermission" WHERE "role" = 'maintenance'), 'none'), CURRENT_TIMESTAMP),
    ('property_owner', COALESCE((SELECT "propertyAccess" FROM "RolePermission" WHERE "role" = 'viewer'), 'none'), CURRENT_TIMESTAMP),
    ('resident_manager', 'none', CURRENT_TIMESTAMP);

DROP TABLE "RolePermission";

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'administrator' THEN 'administrator'
      WHEN 'super_user' THEN 'administrator'
      WHEN 'maintenance' THEN 'maintenance'
      WHEN 'viewer' THEN 'property_owner'
      ELSE 'property_manager'
    END::"UserRole_new"
  );

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'property_manager';
ALTER TABLE "RolePermission_new" RENAME TO "RolePermission";
