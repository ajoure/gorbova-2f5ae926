-- DATA-01: Удаление битых записей из product_club_mappings
-- Удаляем записи, где product_id не существует в products_v2
DELETE FROM product_club_mappings
WHERE product_id NOT IN (SELECT id FROM products_v2);