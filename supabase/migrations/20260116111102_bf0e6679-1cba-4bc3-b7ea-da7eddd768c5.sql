-- Добавляем недостающие view-права для роли admin_gost
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  r.id as role_id,
  p.id as permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin_gost'
  AND p.code IN ('audit.view', 'entitlements.view', 'roles.view', 'support.view')
ON CONFLICT DO NOTHING;