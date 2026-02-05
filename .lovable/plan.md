
# PATCH: Массовый деплой Edge Functions + стабилизация (esm.sh → npm:)

## Результат аудита

### Критическая проблема (BLOCKER)

Все основные Edge Functions возвращают **404 Not Found**, несмотря на регистрацию в `config.toml`:

| Функция | config.toml | Деплой | Статус |
|---------|-------------|--------|--------|
| `telegram-club-members` | ✅ строка 72-73 | ❌ НЕТ | **404** |
| `telegram-bot-actions` | ✅ строка 60-61 | ❌ НЕТ | **404** |
| `bepaid-webhook` | ✅ строка 24-25 | ❌ НЕТ | **404** |
| `bepaid-create-token` | ✅ строка 21-22 | ❌ НЕТ | **404** |
| `integration-healthcheck` | ✅ строка 39-40 | ✅ ДА | **200** |

### Причина

После исправления `project-ref` в GitHub Actions функции не были передеплоены. CI/CD теперь указывает на правильный проект (`hdjgkjceownmmnrqqtuz`), но ни один новый коммит не тригернул деплой всех функций.

### Текущая ошибка (скриншот)

На странице `/admin/integrations/telegram/clubs/.../members` при клике на участника → Network: `POST /functions/v1/telegram-club-members` → **Load failed** (браузер интерпретирует 404 как сетевую ошибку)

---

## Стратегия восстановления

### Правило безопасности

Деплоим **по одной функции** с STOP-guard: если после деплоя функция всё ещё 404 — STOP, анализируем причину.

### Tier 1: Критичные функции (без них сайт не работает)

```text
1. telegram-club-members     ← ТЕКУЩАЯ ОШИБКА на странице
2. telegram-bot-actions      ← Проверка ботов
3. bepaid-webhook           ← Приём платежей
4. bepaid-create-token      ← Создание платежей
5. bepaid-auto-process      ← Автообработка платежей
6. telegram-webhook         ← Приём сообщений Telegram
7. telegram-grant-access    ← Выдача доступов
8. telegram-revoke-access   ← Отзыв доступов
```

### Tier 2: Админ-операции (высокий приоритет)

```text
9. admin-search-profiles
10. subscription-admin-actions
11. roles-admin
12. telegram-mass-broadcast
```

---

## PATCH-1: Стабилизация импортов (esm.sh → npm:)

Перед деплоем нужно исправить нестабильные импорты в критичных функциях.

### telegram-club-members (строка 1)

```typescript
// БЫЛО
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// СТАЛО
import { createClient } from 'npm:@supabase/supabase-js@2';
```

### telegram-bot-actions (строка 1 + security fix строки 36-50)

```typescript
// Строка 1: esm.sh → npm:
import { createClient } from 'npm:@supabase/supabase-js@2';

// Строки 5-6: расширение CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Строки 36-50: разделение клиентов (security fix)
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAuth = createClient(supabaseUrl, anonKey);       // для auth.getUser()
const supabaseAdmin = createClient(supabaseUrl, serviceKey);   // для RPC/DB

// ...

const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

// ...

const { data: hasPermission } = await supabaseAdmin.rpc('has_permission', {
  _user_id: user.id,
  _permission_code: 'entitlements.manage',
});
```

---

## PATCH-2: Последовательный деплой Tier 1

Порядок деплоя с проверкой после каждого шага:

### Шаг 1: telegram-club-members (исправляет текущую ошибку на странице)

```text
1. Исправить импорт (esm.sh → npm:)
2. Деплой: supabase--deploy_edge_functions: ["telegram-club-members"]
3. Проверка: curl → должен быть НЕ 404
4. STOP если 404
```

### Шаг 2: telegram-bot-actions

```text
1. Исправить импорт + security fix (два клиента)
2. Деплой
3. Проверка
```

### Шаги 3-8: Остальные Tier 1

```text
bepaid-webhook
bepaid-create-token
bepaid-auto-process
telegram-webhook
telegram-grant-access
telegram-revoke-access
```

---

## PATCH-3: Деплой Tier 2

После успешного Tier 1:

```text
admin-search-profiles
subscription-admin-actions
roles-admin
telegram-mass-broadcast
```

---

## PATCH-4: CORS-заголовки (если "Load failed" не исчезнет)

Если после деплоя функция отвечает (не 404), но UI всё равно показывает "Load failed" — причина в CORS preflight.

Стандартные CORS headers для всех функций:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
```

---

## Техническая информация

### Изменяемые файлы (Tier 1)

| Файл | Изменение |
|------|-----------|
| `supabase/functions/telegram-club-members/index.ts` | esm.sh → npm: |
| `supabase/functions/telegram-bot-actions/index.ts` | esm.sh → npm:, два клиента, CORS |
| `supabase/functions/bepaid-webhook/index.ts` | esm.sh → npm: (если есть) |
| `supabase/functions/bepaid-create-token/index.ts` | esm.sh → npm: (если есть) |
| `supabase/functions/bepaid-auto-process/index.ts` | esm.sh → npm: (если есть) |
| `supabase/functions/telegram-webhook/index.ts` | esm.sh → npm: (если есть) |
| `supabase/functions/telegram-grant-access/index.ts` | esm.sh → npm: (если есть) |
| `supabase/functions/telegram-revoke-access/index.ts` | esm.sh → npm: (если есть) |

### Security

- `verify_jwt = false` уже установлен для всех функций в config.toml
- `telegram-club-members`: auth guard правильный (anon client для getUser) ✅
- `telegram-bot-actions`: auth guard неправильный (service-role для getUser) — нужен FIX

---

## Верификация (DoD)

### После каждого деплоя

```bash
curl -i -X POST "https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/<FUNCTION>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Ожидаем:** НЕ 404 (допустимо 401/400/500 — главное не 404)

### Финальная проверка

1. `/admin/integrations/telegram/clubs/.../members` → клик на участника → проверка статуса работает
2. `/admin/integrations/telegram` → "Проверка подключения" работает
3. Network: НЕТ запросов с `Error: Load failed`

### Diff-summary

```text
supabase/functions/telegram-club-members/index.ts   +npm: import
supabase/functions/telegram-bot-actions/index.ts    +npm: import, +два клиента, +CORS
supabase/functions/bepaid-webhook/index.ts          +npm: import (если нужно)
... (остальные Tier 1)
```
