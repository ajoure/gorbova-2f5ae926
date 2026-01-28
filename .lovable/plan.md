
# План исправления: Разлогинивание на мобильном Safari + Синхронизация FAQ

## Часть 1: Исправление разлогинивания в мобильном Safari

### Причина
При каждом моём ответе Lovable перезагружает превью (hot reload). На мобильном Safari восстановление сессии Supabase занимает дольше времени из-за:
- Более строгих ограничений на localStorage
- Медленного cold start JavaScript
- Агрессивного управления памятью iOS

Текущая задержка 500ms в ProtectedRoute недостаточна для мобильных устройств.

### Решение
Увеличить задержку инициализации и добавить проверку сессии через getSession:

```
Файл: src/components/layout/ProtectedRoute.tsx

Изменения:
1. Увеличить задержку с 500ms до 1000ms для мобильных устройств
2. Добавить проверку: если loading=false, но сессия ещё не проверена — ждём дольше
3. Использовать navigator.userAgent для определения мобильного Safari
```

### Код
```typescript
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  const [isInitializing, setIsInitializing] = useState(true);
  
  useEffect(() => {
    // Определяем мобильный Safari
    const isMobileSafari = /iPhone|iPad|iPod/.test(navigator.userAgent) && 
                           /Safari/.test(navigator.userAgent) &&
                           !/Chrome/.test(navigator.userAgent);
    
    // Для мобильного Safari даём больше времени на восстановление сессии
    const delay = isMobileSafari ? 1200 : 500;
    
    const timer = setTimeout(() => setIsInitializing(false), delay);
    return () => clearTimeout(timer);
  }, []);

  if (loading || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center ...">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const redirectTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirectTo=${redirectTo}`} replace />;
  }

  return <>{children}</>;
}
```

---

## Часть 2: Синхронизация Documentation.tsx с Help.tsx

### Проблема
- `/help` (Help.tsx) — обновлён мной (1290 строк, полное руководство по тренингам)
- `/docs` (Documentation.tsx) — старая версия (438 строк)
- Ссылка "FAQ" в мобильном меню ведёт на `/docs`

### Решение
Перенести весь обновлённый контент из Help.tsx в Documentation.tsx, сохранив структуру с Tabs и GlassCard.

### Ключевые разделы для добавления в Documentation.tsx

**Для пользователей (sections):**
1. Обновить "Подписка и оплата" — добавить информацию о календарном месяце
2. Добавить раздел "База знаний"

**Для администраторов (adminSections):**
1. "Управление тренингами" — общая структура
2. "Мастер создания контента" — 5-шаговый wizard
3. "Редактор уроков" — блочный редактор
4. "Блоки: Текст и структура" — заголовки, аккордеоны, выноски
5. "Блоки: Медиа-контент" — видео, аудио, галереи
6. "Блоки: Интерактив" — кнопки, embed, timeline
7. "Блоки: Тесты" — 7 типов вопросов
8. "Доступ к контенту" — привязка к тарифам
9. "AI-генерация обложек" — Lovable AI

### Структура обновлённого Documentation.tsx

```typescript
const sections = [
  { id: "getting-started", title: "Начало работы", ... },
  { id: "knowledge-base", title: "База знаний", ... },  // НОВЫЙ
  { id: "tools", title: "Инструменты", ... },
  { id: "subscription", title: "Подписка и оплата", ... },  // ОБНОВИТЬ
  { id: "telegram", title: "Telegram-клуб", ... },
];

const adminSections = [
  { id: "admin-users", ... },
  { id: "admin-telegram", ... },
  { id: "admin-roles", ... },
  { id: "admin-integrations", ... },
  // НОВЫЕ РАЗДЕЛЫ:
  { id: "trainings", title: "Управление тренингами", icon: GraduationCap, ... },
  { id: "trainings-wizard", title: "Мастер создания контента", icon: Wand2, ... },
  { id: "lesson-editor", title: "Редактор уроков", icon: Blocks, ... },
  { id: "blocks-text", title: "Блоки: Текст и структура", icon: Type, ... },
  { id: "blocks-media", title: "Блоки: Медиа-контент", icon: Image, ... },
  { id: "blocks-interactive", title: "Блоки: Интерактив", icon: Layers, ... },
  { id: "blocks-quiz", title: "Блоки: Тесты и проверки", icon: CheckSquare, ... },
  { id: "trainings-access", title: "Доступ к контенту", icon: Lock, ... },
  { id: "trainings-ai", title: "AI-генерация обложек", icon: Sparkles, ... },
];
```

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/components/layout/ProtectedRoute.tsx` | Увеличить задержку для мобильного Safari до 1200ms |
| `src/pages/Documentation.tsx` | Добавить все новые разделы по тренингам из Help.tsx |

---

## Результат

1. **Разлогинивание на мобильном Safari** — исправлено увеличенной задержкой
2. **FAQ (/docs)** — полностью обновлён с новым контентом по тренингам
3. **Единая документация** — /docs и /help показывают актуальную информацию
