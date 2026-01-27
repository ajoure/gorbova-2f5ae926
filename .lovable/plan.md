
# План: Исправление размещения модулей и AI генерации обложки

## Выявленные проблемы

### Проблема 1: Модули появляются на /library вместо /knowledge

**Скриншоты показывают:**
- На `/library` (image-694): модули "База знаний" и "новый модуль" отображаются как карточки
- На `/knowledge` (image-696): те же модули появляются как маленькие карточки вверху вкладки "Видеоответы"
- Модули созданы с `menu_section_key: knowledge-videos`

**Причина:**
В файле `src/pages/Library.tsx` строка 22:
```typescript
const accessibleModules = modules.filter(m => m.is_active);
```
Этот код не фильтрует по `menu_section_key` — показывает ВСЕ модули на странице /library

**Ожидаемое поведение:**
- Модули с `menu_section_key` начинающимся на `knowledge-*` должны отображаться ТОЛЬКО в `/knowledge`
- `/library` должна показывать только модули с `menu_section_key: products-library` или `products`

### Проблема 2: AI генерация обложки не работает (404)

**Результат теста:**
```
supabase--curl_edge_functions: status code 404, body 404 Not Found
```

**Причина:**
Функция `generate-cover` существует в коде (файл `supabase/functions/generate-cover/index.ts`), конфиг есть в `config.toml` (строка 297-298), но функция **не развёрнута** на сервере.

**Секрет `LOVABLE_API_KEY`** присутствует — это подтверждено.

---

## План исправлений

### Этап 1: Фильтрация модулей на /library

**Файл:** `src/pages/Library.tsx`

Изменения:
1. Фильтровать модули только по `menu_section_key`, которые относятся к "products" секции
2. Исключить модули с key начинающимся на `knowledge-`

```typescript
// БЫЛО:
const accessibleModules = modules.filter(m => m.is_active);

// СТАНЕТ:
const accessibleModules = modules.filter(m => {
  if (!m.is_active) return false;
  const key = m.menu_section_key || "";
  // Показывать только модули для products секции, исключая knowledge-*
  return !key.startsWith("knowledge-") && !key.startsWith("training-");
});
```

Альтернативный вариант (более точный):
```typescript
const libraryModules = modules.filter(m => {
  if (!m.is_active) return false;
  const key = m.menu_section_key || "products-library";
  // Только products-library или products
  return key === "products-library" || key === "products" || key.startsWith("products-");
});
```

### Этап 2: Развёртывание функции generate-cover

**Действие:** Принудительно развернуть edge function `generate-cover`

После развёртывания проверить:
1. Вызов через curl: `/generate-cover` с body `{ "title": "Test" }`
2. Проверить логи функции на наличие ответа от AI

### Этап 3: Улучшение UI генерации обложки

**Файл:** `src/components/admin/trainings/ModuleFormFields.tsx`

Текущий код выглядит правильно (строки 125-163), но нужно улучшить обработку ошибок:

1. Показывать конкретную ошибку если функция недоступна
2. Добавить retry логику
3. Показать прогресс генерации (AI может занять 10-20 секунд)

---

## Файлы для изменения

| Файл | Действие |
|------|----------|
| `src/pages/Library.tsx` | Добавить фильтрацию по `menu_section_key` |
| `supabase/functions/generate-cover/index.ts` | Развернуть функцию (deploy) |

---

## Технические детали

### Логика фильтрации menu_section_key

Текущие значения в базе:
- `knowledge-videos` — для вкладки "Видеоответы" в /knowledge
- `knowledge-questions` — для вкладки "Вопросы" в /knowledge
- `knowledge-laws` — для вкладки "Законодательство" в /knowledge
- `products-library` — для страницы /library (по умолчанию)

Правило:
- `/knowledge` показывает модули где `menu_section_key` начинается с `knowledge-`
- `/library` показывает модули где `menu_section_key` начинается с `products-` или пустой/null

### Модель AI для обложек

Используется `google/gemini-2.5-flash-image` через Lovable AI Gateway.
Промпт генерирует минималистичную обложку без текста.

---

## Проверка готовности

После реализации:
1. Открыть `/library` — должны быть только модули для библиотеки (если есть)
2. Открыть `/knowledge` → вкладка "Видеоответы" — должны быть модули "База знаний" и "новый модуль"
3. Нажать кнопку AI в редактировании модуля — должна сгенерироваться обложка

---

## Результат

1. **Модули отображаются в правильных местах** — knowledge-модули только в /knowledge, products-модули только в /library
2. **AI генерация обложки работает** — функция развёрнута и доступна
