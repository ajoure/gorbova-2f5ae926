/**
 * Email Template Validation Utilities
 * Provides allowlist for template variables and validation functions
 */

// Allowed variables that can be used in email templates
export const ALLOWED_TEMPLATE_VARIABLES = [
  // User data
  'full_name',
  'first_name', 
  'last_name',
  'name',
  'email',
  
  // Authentication
  'temp_password',
  'tempPassword',
  'reset_link',
  'resetLink',
  'login_link',
  'loginLink',
  'verification_code',
  
  // Application
  'app_name',
  'appName',
  'club_url',
  
  // Order/Payment
  'order_id',
  'orderId',
  'order_number',
  'amount',
  'currency',
  'product_name',
  'productName',
  
  // Roles
  'role_name',
  'roleName',
  
  // Dates
  'expiry_date',
  'date',
] as const;

export type AllowedVariable = typeof ALLOWED_TEMPLATE_VARIABLES[number];

/**
 * Extract all template variables from a string
 * Matches {{variable_name}} pattern
 */
export function extractTemplateVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return matches.map(m => m.slice(2, -2));
}

/**
 * Validate template variables against allowlist
 * Returns object with validation result and invalid variables
 */
export function validateTemplateVariables(text: string): { 
  valid: boolean; 
  invalidVariables: string[];
  usedVariables: string[];
} {
  const usedVariables = extractTemplateVariables(text);
  const allowedSet = new Set<string>(ALLOWED_TEMPLATE_VARIABLES);
  const invalidVariables = usedVariables.filter(v => !allowedSet.has(v));
  
  return {
    valid: invalidVariables.length === 0,
    invalidVariables,
    usedVariables
  };
}

/**
 * Test data for template preview
 */
export const TEMPLATE_TEST_DATA: Record<string, string> = {
  full_name: 'Иван Иванов',
  first_name: 'Иван',
  last_name: 'Иванов',
  name: 'Иван Иванов',
  email: 'ivan@example.com',
  temp_password: 'TempPass123!',
  tempPassword: 'TempPass123!',
  reset_link: 'https://club.gorbova.by/reset?token=xxx',
  resetLink: 'https://club.gorbova.by/reset?token=xxx',
  login_link: 'https://club.gorbova.by/auth',
  loginLink: 'https://club.gorbova.by/auth',
  verification_code: '123456',
  app_name: 'Gorbova Club',
  appName: 'Gorbova Club',
  club_url: 'https://club.gorbova.by',
  order_id: 'ORD-12345',
  orderId: 'ORD-12345',
  order_number: '12345',
  amount: '99.00',
  currency: 'BYN',
  product_name: 'Подписка Pro',
  productName: 'Подписка Pro',
  role_name: 'Администратор',
  roleName: 'Администратор',
  expiry_date: '31.12.2025',
  date: '15.01.2025',
};

/**
 * Replace template variables with test data for preview
 */
export function renderTemplatePreview(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return TEMPLATE_TEST_DATA[key] || match;
  });
}
