

# План: Исправление системы доступа к обучающим модулям

## Диагностика (подтверждено)

### Корневая причина
RLS-политика на таблице `module_access` требует permission `content.manage`, который **не существует** в базе данных. Существуют только: `content.view`, `content.edit`, `content.publish`.

В результате:
1. Запрос к `module_access` возвращает пустой массив для обычных пользователей
2. Код интерпретирует пустой массив как "модуль публичный"
3. Карточки модулей показываются как доступные
4. Но RLS на `lesson_blocks` правильно блокирует контент
5. Пользователь видит пустую страницу "Раздел пока пуст"

### Данные в базе (проверено)
| Таблица | Данные |
|---------|--------|
| `module_access` | 2 записи: модуль "Уроки без модулей" → FULL, BUSINESS |
| Пользователь | Юлия Рабчевская, tariff: BUSINESS (активный) |
| `lesson_blocks` | 100 блоков для 100 уроков контейнер-модуля |

---

## План исправлений

### Шаг 1: Добавить RLS политику для чтения module_access

Текущая RLS требует `content.manage` для чтения. Нужно добавить политику, разрешающую SELECT всем авторизованным пользователям (данные не секретные).

```sql
-- Разрешить чтение module_access всем авторизованным пользователям
CREATE POLICY "Authenticated users can read module_access"
ON public.module_access
FOR SELECT
TO authenticated
USING (true);
```

### Шаг 2: Создать permission content.manage

Добавить отсутствующий permission для согласованности системы:

```sql
INSERT INTO public.permissions (code, name, category)
VALUES ('content.manage', 'Управление контентом', 'content')
ON CONFLICT (code) DO NOTHING;

-- Привязать к ролям admin и super_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code IN ('admin', 'super_admin')
  AND p.code = 'content.manage'
ON CONFLICT DO NOTHING;
```

### Шаг 3: Добавить политику чтения для training_modules и training_lessons

Убедиться, что все авторизованные пользователи могут читать метаданные модулей/уроков:

```sql
-- Чтение модулей для всех авторизованных
CREATE POLICY "Authenticated users can view active modules"
ON public.training_modules
FOR SELECT
TO authenticated
USING (is_active = true);

-- Чтение уроков для всех авторизованных
CREATE POLICY "Authenticated users can view active lessons"
ON public.training_lessons
FOR SELECT
TO authenticated
USING (is_active = true);
```

### Шаг 4: Обновить useContainerLessons для проверки доступа

Сейчас `has_access: true` захардкожен. Нужно добавить реальную проверку.

**Файл:** `src/hooks/useContainerLessons.ts`

```tsx
// Получить tariff_ids для контейнер-модулей
const { data: containerAccess } = await supabase
  .from("module_access")
  .select("module_id, tariff_id")
  .in("module_id", containerIds);

const accessByContainer = new Map<string, string[]>();
containerAccess?.forEach(a => {
  if (!accessByContainer.has(a.module_id)) {
    accessByContainer.set(a.module_id, []);
  }
  accessByContainer.get(a.module_id)!.push(a.tariff_id);
});

// При маппинге уроков проверять доступ к контейнеру
const containerTariffs = accessByContainer.get(lesson.module_id) || [];
const hasAccess = containerTariffs.length === 0 || 
  containerTariffs.some(tid => userTariffIds.includes(tid));
```

### Шаг 5: Исправить отображение плашки в Knowledge.tsx

Передавать названия тарифов из контейнер-модулей для плашки.

**Файл:** `src/pages/Knowledge.tsx`

```tsx
// Собрать тарифы из standaloneLessons (через containerData)
const restrictedContainerTariffs = containerData?.restrictedTariffs || [];

// Объединить с тарифами из модулей
const allRestrictedTariffs = [
  ...restrictedModules.flatMap((m) => m.accessible_tariffs || []),
  ...restrictedContainerTariffs
].filter((v, i, a) => v && a.indexOf(v) === i);

<RestrictedAccessBanner accessibleTariffs={allRestrictedTariffs} />
```

---

## Технические детали

### SQL миграция (одна транзакция)

```sql
-- 1. RLS для чтения module_access
CREATE POLICY "Authenticated users can read module_access"
ON public.module_access
FOR SELECT
TO authenticated
USING (true);

-- 2. RLS для чтения training_modules
CREATE POLICY "Authenticated users can view active modules"
ON public.training_modules
FOR SELECT
TO authenticated
USING (is_active = true);

-- 3. RLS для чтения training_lessons
CREATE POLICY "Authenticated users can view active lessons"
ON public.training_lessons
FOR SELECT
TO authenticated
USING (is_active = true);

-- 4. Добавить permission content.manage
INSERT INTO public.permissions (code, name, category)
VALUES ('content.manage', 'Управление контентом', 'content')
ON CONFLICT (code) DO NOTHING;

-- 5. Привязать к ролям
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('admin', 'super_admin')
  AND p.code = 'content.manage'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
```

### Изменения в коде

| Файл | Изменение |
|------|-----------|
| `src/hooks/useContainerLessons.ts` | Добавить проверку доступа к контейнер-модулям |
| `src/pages/Knowledge.tsx` | Передавать тарифы из контейнеров в плашку |

---

## Ожидаемый результат

После исправлений:
- Пользователи с FULL/BUSINESS тарифами видят видео-контент
- Пользователи с CHAT тарифом видят плашку "Контент доступен участникам Клуба" с названиями нужных тарифов
- Настройки доступа в админ-панели работают корректно
- Админы сохраняют полный доступ ко всему контенту

