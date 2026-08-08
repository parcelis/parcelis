CREATE TYPE "PermissionResource_new" AS ENUM (
    'properties',
    'units',
    'tenants',
    'maintenance',
    'property_notes',
    'unit_notes',
    'tenant_notes',
    'maintenance_notes'
);

ALTER TABLE "RolePermission" RENAME TO "RolePermission_old";
ALTER TABLE "RolePermission_old" RENAME CONSTRAINT "RolePermission_pkey" TO "RolePermission_old_pkey";

CREATE TABLE "RolePermission" (
    "role" "UserRole" NOT NULL,
    "resource" "PermissionResource_new" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canArchive" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "resource")
);

INSERT INTO "RolePermission" (
    "role", "resource", "canView", "canCreate", "canEdit", "canArchive", "canDelete", "updatedAt"
)
SELECT
    "role",
    "resource"::text::"PermissionResource_new",
    "canView",
    "canCreate",
    "canEdit",
    "canArchive",
    "canDelete",
    "updatedAt"
FROM "RolePermission_old"
WHERE "resource" <> 'notes';

INSERT INTO "RolePermission" (
    "role", "resource", "canView", "canCreate", "canEdit", "canArchive", "canDelete", "updatedAt"
)
SELECT
    permission."role",
    scope."resource"::"PermissionResource_new",
    permission."canView",
    permission."canCreate",
    permission."canEdit",
    false,
    permission."canDelete",
    CURRENT_TIMESTAMP
FROM "RolePermission_old" permission
CROSS JOIN (
    VALUES ('property_notes'), ('unit_notes'), ('tenant_notes'), ('maintenance_notes')
) AS scope("resource")
WHERE permission."resource" = 'notes';

DROP TABLE "RolePermission_old";
DROP TYPE "PermissionResource";
ALTER TYPE "PermissionResource_new" RENAME TO "PermissionResource";
