// Centralized product names mapping
export const PRODUCT_NAMES: Record<string, string> = {
  CB20: "Бухгалтер частной практики 2.0",
  cb20_predzapis: "Бухгалтер частной практики 2.0 (предзапись)",
  CLUB: "Клуб Буква Закона",
  buh_business: "Бухгалтерия как бизнес",
};

export function getProductName(code: string): string {
  return PRODUCT_NAMES[code] || code;
}
