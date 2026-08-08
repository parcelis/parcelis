CREATE TYPE "PermissionResource" AS ENUM ('properties', 'units', 'tenants', 'maintenance', 'notes');

ALTER TABLE "RolePermission" RENAME TO "RolePermission_old";
ALTER TABLE "RolePermission_old" RENAME CONSTRAINT "RolePermission_pkey" TO "RolePermission_old_pkey";

CREATE TABLE "RolePermission" (
    "role" "UserRole" NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canArchive" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "resource")
);

INSERT INTO "RolePermission" (
    "role",
    "resource",
    "canView",
    "canCreate",
    "canEdit",
    "canArchive",
    "canDelete",
    "updatedAt"
)
SELECT
    role_permission."role",
    resource."resource"::"PermissionResource",
    CASE
        WHEN role_permission."role" = 'administrator' THEN true
        WHEN resource."resource" IN ('properties', 'units') THEN role_permission."propertyAccess" IN ('view', 'edit', 'delete', 'all')
        ELSE true
    END,
    CASE
        WHEN role_permission."role" = 'administrator' THEN true
        WHEN resource."resource" IN ('properties', 'units') THEN role_permission."propertyAccess" IN ('edit', 'delete', 'all')
        ELSE true
    END,
    CASE
        WHEN role_permission."role" = 'administrator' THEN true
        WHEN resource."resource" IN ('properties', 'units') THEN role_permission."propertyAccess" IN ('edit', 'delete', 'all')
        ELSE true
    END,
    CASE
        WHEN resource."resource" = 'notes' THEN false
        WHEN role_permission."role" = 'administrator' THEN true
        WHEN resource."resource" IN ('properties', 'units') THEN role_permission."propertyAccess" IN ('delete', 'all')
        ELSE true
    END,
    CASE
        WHEN role_permission."role" = 'administrator' THEN true
        WHEN resource."resource" IN ('properties', 'units') THEN role_permission."propertyAccess" IN ('delete', 'all')
        ELSE true
    END,
    CURRENT_TIMESTAMP
FROM "RolePermission_old" role_permission
CROSS JOIN (
    VALUES ('properties'), ('units'), ('tenants'), ('maintenance'), ('notes')
) AS resource("resource");

DROP TABLE "RolePermission_old";
DROP TYPE "PropertyAccessLevel";
