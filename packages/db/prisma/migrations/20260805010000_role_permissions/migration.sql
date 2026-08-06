CREATE TYPE "PropertyAccessLevel" AS ENUM ('none', 'view', 'edit', 'delete', 'all');

CREATE TABLE "RolePermission" (
    "role" "UserRole" NOT NULL,
    "propertyAccess" "PropertyAccessLevel" NOT NULL DEFAULT 'none',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role")
);

INSERT INTO "RolePermission" ("role", "propertyAccess", "updatedAt")
VALUES
    ('administrator', 'all', CURRENT_TIMESTAMP),
    ('member', 'none', CURRENT_TIMESTAMP);
