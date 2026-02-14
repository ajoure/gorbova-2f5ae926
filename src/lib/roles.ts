/**
 * Единый helper для отображения ролей.
 * Используйте getRoleDisplayName() вместо локальных маппингов.
 */

/** Маппинг code → русское название */
const ROLE_DISPLAY_NAMES: Record<string, string> = {
  super_admin: "Владелец",
  admin: "Администратор",
  admin_gost: "Администратор-гость",
  editor: "Редактор",
  news_editor: "Редактор новостей",
  support: "Поддержка",
  staff: "Сотрудник",
  user: "Пользователь",
};

/**
 * Возвращает человекочитаемое название роли.
 * Приоритет: role.name из БД → маппинг по code → code как fallback.
 */
export function getRoleDisplayName(codeOrRole: string | { code: string; name?: string }): string {
  if (typeof codeOrRole === "string") {
    return ROLE_DISPLAY_NAMES[codeOrRole] || codeOrRole;
  }
  // Если есть name из БД и он не совпадает с code — использовать name
  if (codeOrRole.name && codeOrRole.name !== codeOrRole.code) {
    return codeOrRole.name;
  }
  return ROLE_DISPLAY_NAMES[codeOrRole.code] || codeOrRole.code;
}

/** Цвета бейджей ролей (glassmorphism-стиль) */
export const ROLE_BADGE_STYLES: Record<string, string> = {
  super_admin: "bg-red-500/15 text-red-400 border-red-500/25",
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  admin_gost: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
  editor: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  news_editor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  support: "bg-green-500/15 text-green-400 border-green-500/25",
  staff: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

export function getRoleBadgeStyle(code: string): string {
  return ROLE_BADGE_STYLES[code] || "bg-muted/50 text-muted-foreground border-border/50";
}

/** Gradient-цвета для иконок ролей */
export const ROLE_ICON_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "bg-red-500/15", text: "text-red-400" },
  admin: { bg: "bg-purple-500/15", text: "text-purple-400" },
  admin_gost: { bg: "bg-indigo-500/15", text: "text-indigo-400" },
  editor: { bg: "bg-blue-500/15", text: "text-blue-400" },
  news_editor: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  support: { bg: "bg-green-500/15", text: "text-green-400" },
  staff: { bg: "bg-amber-500/15", text: "text-amber-400" },
  user: { bg: "bg-muted/50", text: "text-muted-foreground" },
};

export function getRoleIconColors(code: string) {
  return ROLE_ICON_COLORS[code] || { bg: "bg-primary/10", text: "text-primary" };
}
