-- Delete any admin_menu_settings records with empty items array
-- This will allow the default menu (with iLex) to be used
DELETE FROM admin_menu_settings 
WHERE items::text = '[]' OR items::text = 'null';