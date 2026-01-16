// Централизованный справочник сфер (категорий)
// Используется во всех частях системы: задачи, колесо баланса, фильтры
// Синхронизированы с секторами Колеса Баланса

export interface Sphere {
  id: string;
  name: string;
  color: string;
  group: string;
}

// Сферы из Колеса Баланса
export const SPHERES: Sphere[] = [
  // Служебная
  { id: "none", name: "Без категории", color: "#6b7280", group: "Служебная" },
  
  // Колесо баланса - сферы
  { id: "health", name: "Здоровье и спорт", color: "#3b82f6", group: "Колесо баланса" },
  { id: "money", name: "Деньги", color: "#8b5cf6", group: "Колесо баланса" },
  { id: "career", name: "Работа, карьера и бизнес", color: "#ec4899", group: "Колесо баланса" },
  { id: "family", name: "Любовь, семья и дети", color: "#ef4444", group: "Колесо баланса" },
  { id: "friends", name: "Окружение и друзья", color: "#f97316", group: "Колесо баланса" },
  { id: "growth", name: "Личностный рост", color: "#eab308", group: "Колесо баланса" },
  { id: "hobbies", name: "Хобби и развлечения", color: "#22c55e", group: "Колесо баланса" },
  { id: "spirituality", name: "Духовность", color: "#14b8a6", group: "Колесо баланса" },
];

// Получить сферу по ID
export function getSphereById(id: string | null | undefined): Sphere {
  if (!id) return SPHERES[0]; // Без категории
  return SPHERES.find(s => s.id === id) || SPHERES[0];
}

// Получить сферу по имени
export function getSphereByName(name: string | null | undefined): Sphere {
  if (!name) return SPHERES[0];
  return SPHERES.find(s => s.name === name) || SPHERES[0];
}

// Группы сфер для отображения в dropdown с разделителями
export function getGroupedSpheres(): { group: string; spheres: Sphere[] }[] {
  const groups: { group: string; spheres: Sphere[] }[] = [];
  
  SPHERES.forEach(sphere => {
    const existingGroup = groups.find(g => g.group === sphere.group);
    if (existingGroup) {
      existingGroup.spheres.push(sphere);
    } else {
      groups.push({ group: sphere.group, spheres: [sphere] });
    }
  });
  
  return groups;
}

// Маппинг ключей колеса баланса к ID сфер
export const WHEEL_KEY_TO_SPHERE: Record<string, string> = {
  audit: "health",        // Здоровье и спорт
  awareness: "money",     // Деньги
  intention: "career",    // Работа, карьера и бизнес
  goal: "family",         // Любовь, семья и дети
  task: "friends",        // Окружение и друзья
  priority: "growth",     // Личностный рост
  reflection: "hobbies",  // Хобби и развлечения
  integration: "spirituality", // Духовность
};

// Обратный маппинг: ID сферы -> ключ колеса
export const SPHERE_TO_WHEEL_KEY: Record<string, string> = {
  health: "audit",
  money: "awareness",
  career: "intention",
  family: "goal",
  friends: "task",
  growth: "priority",
  hobbies: "reflection",
  spirituality: "integration",
};
