-- Create subscriptions permissions
INSERT INTO permissions (code, name, category)
VALUES
  ('subscriptions.view', 'Просмотр подписок', 'subscriptions'),
  ('subscriptions.edit', 'Редактирование подписок', 'subscriptions')
ON CONFLICT (code) DO NOTHING;

-- Assign to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('subscriptions.view', 'subscriptions.edit')
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

-- Assign to super_admin role (if exists)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('subscriptions.view', 'subscriptions.edit')
WHERE r.code = 'super_admin'
ON CONFLICT DO NOTHING;