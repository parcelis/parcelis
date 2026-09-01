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
  role."role",
  resource."resource"::"PermissionResource",
  false,
  false,
  false,
  false,
  false,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('administrator'::"UserRole"),
    ('property_manager'::"UserRole"),
    ('lease_manager'::"UserRole"),
    ('maintenance'::"UserRole"),
    ('property_owner'::"UserRole"),
    ('resident_manager'::"UserRole")
) AS role("role")
CROSS JOIN (
  VALUES ('leases'), ('applications'), ('application_notes')
) AS resource("resource")
ON CONFLICT ("role", "resource") DO NOTHING;
