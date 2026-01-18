// Centralized product names mapping
export const PRODUCT_NAMES: Record<string, string> = {
  // Legacy codes (для обратной совместимости)
  CB20: "Бухгалтер частной практики 2.0",
  cb20_predzapis: "Бухгалтер частной практики 2.0 (предзапись)",
  CLUB: "Клуб Буква Закона",
  buh_business: "Бухгалтерия как бизнес",
  
  // Основные продукты (коды из products_v2)
  club: "Gorbova Club",
  cb20: "Ценный бухгалтер 2.0",
  consultation: "Платная консультация",
  
  // Модули ЦБ 2.0
  cb_module_ip: "ЦБ 2.0: Учет у ИП",
  cb_module_pvt: "ЦБ 2.0: ПВТ",
  cb_module_marketplaces: "ЦБ 2.0: Маркетплейсы",
  cb_module_construction: "ЦБ 2.0: Строительство",
  cb_module_production: "ЦБ 2.0: Производство",
  cb_module_catering: "ЦБ 2.0: Общепит",
  cb_module_retail: "ЦБ 2.0: Розничная торговля",
  
  // Вебинары
  web_safe_contract: "Безопасный договор",
  web_no_fines: "Как не платить штрафы",
  web_reduce_fine: "Как снизить штраф",
  web_bso_2025: "БСО: учет до и после 01.07.25",
  web_ads: "Реклама без налогов (РБ/РФ)",
  web_low_fszn: "Как платить мало ФСЗН",
  
  // Курсы
  course_close_year: "ЗАКРОЙ ГОД",
};

export function getProductName(code: string): string {
  return PRODUCT_NAMES[code] || code;
}

// Категории продуктов
export const PRODUCT_CATEGORIES = [
  'subscription',
  'course',
  'module',
  'service',
  'digital_product',
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  subscription: "Подписка",
  course: "Курс",
  module: "Модуль",
  service: "Услуга",
  digital_product: "Цифровой продукт",
};

export function getCategoryLabel(category: string): string {
  return PRODUCT_CATEGORY_LABELS[category as ProductCategory] || category;
}
