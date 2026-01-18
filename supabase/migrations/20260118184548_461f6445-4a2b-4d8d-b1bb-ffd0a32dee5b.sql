-- Добавляем колонку category в products_v2
ALTER TABLE products_v2 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'course';

-- Обновляем категории существующих продуктов
UPDATE products_v2 SET category = 'subscription' WHERE code = 'club';
UPDATE products_v2 SET category = 'subscription' WHERE code = 'buh_business';
UPDATE products_v2 SET category = 'service' WHERE code = 'consultation';
UPDATE products_v2 SET category = 'course' WHERE code = 'cb20';

-- Модули ЦБ 2.0 (категория: module)
INSERT INTO products_v2 (code, name, category, status, is_active, currency) VALUES
('cb_module_ip', 'ЦБ 2.0: Учет у ИП', 'module', 'active', true, 'BYN'),
('cb_module_pvt', 'ЦБ 2.0: ПВТ', 'module', 'active', true, 'BYN'),
('cb_module_marketplaces', 'ЦБ 2.0: Маркетплейсы', 'module', 'active', true, 'BYN'),
('cb_module_construction', 'ЦБ 2.0: Строительство', 'module', 'active', true, 'BYN'),
('cb_module_production', 'ЦБ 2.0: Производство', 'module', 'active', true, 'BYN'),
('cb_module_catering', 'ЦБ 2.0: Общепит', 'module', 'active', true, 'BYN'),
('cb_module_retail', 'ЦБ 2.0: Розничная торговля', 'module', 'active', true, 'BYN')
ON CONFLICT (code) DO NOTHING;

-- Вебинары (категория: digital_product)
INSERT INTO products_v2 (code, name, category, status, is_active, currency) VALUES
('web_safe_contract', 'Безопасный договор', 'digital_product', 'active', true, 'BYN'),
('web_no_fines', 'Как не платить штрафы', 'digital_product', 'active', true, 'BYN'),
('web_reduce_fine', 'Как снизить штраф', 'digital_product', 'active', true, 'BYN'),
('web_bso_2025', 'БСО: учет до и после 01.07.25', 'digital_product', 'active', true, 'BYN'),
('web_ads', 'Реклама без налогов (РБ/РФ)', 'digital_product', 'active', true, 'BYN'),
('web_low_fszn', 'Как платить мало ФСЗН', 'digital_product', 'active', true, 'BYN')
ON CONFLICT (code) DO NOTHING;

-- Курс "Закрой год" (категория: course)
INSERT INTO products_v2 (code, name, category, status, is_active, currency) VALUES
('course_close_year', 'ЗАКРОЙ ГОД', 'course', 'active', true, 'BYN')
ON CONFLICT (code) DO NOTHING;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN products_v2.category IS 'Категория продукта: subscription, course, module, service, digital_product';