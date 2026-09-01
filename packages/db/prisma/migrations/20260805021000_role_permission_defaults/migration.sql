INSERT INTO "RolePermission" ("role", "propertyAccess", "updatedAt")
VALUES
    ('viewer', 'none', CURRENT_TIMESTAMP),
    ('super_user', 'none', CURRENT_TIMESTAMP),
    ('maintenance', 'none', CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
