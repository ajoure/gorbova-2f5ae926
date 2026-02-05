
Цель: убрать ошибку “Failed to send a request to the Edge Function” в модалке «Синхронизация с Выпиской bePaid» и одновременно устранить deploy-ошибку “Bundle generation timed out” минимальным diff’ом, строго в рамках PATCH.

## 0) Что сейчас происходит (Dry-run / факты)
1) UI вызывает backend‑функцию:
- `src/components/admin/payments/SyncWithStatementDialog.tsx` → `supabase.functions.invoke('sync-payments-with-statement', ...)`

2) Функция в backend сейчас НЕ доступна:
- Проверка вызовом `POST /functions/v1/sync-payments-with-statement` возвращает **404 NOT_FOUND** (Requested function was not found).

3) Причина 404 в текущей архитектуре проекта:
- В `supabase/config.toml` **нет секции** `[functions.sync-payments-with-statement]`.
- По факту в этом проекте задеплоены/доступны именно те функции, которые перечислены в `supabase/config.toml` (это уже проявлялось раньше на кейсе `bepaid-list-subscriptions`).

4) Дополнительный риск для деплоя (почему вы видите “Bundle generation timed out”):
- В `supabase/functions/sync-payments-with-statement/index.ts` используется импорт `createClient` через `https://esm.sh/...`, а `esm.sh` реально бывает нестабилен на bundling’е.
- Самый минимальный и проверенный способ снизить риск таймаута — заменить `esm.sh` на `npm:`.

Важно по безопасности:
- Внутри `sync-payments-with-statement` уже есть ручная проверка Authorization + проверка роли через RPC `has_role` (403 для не-админа). Значит `verify_jwt=false` допустим (JWT проверяется вручную).

---

## 1) PATCH (минимальный diff, только это)

### PATCH-1 (BLOCKER): Исправить импорт Supabase клиента для стабильного bundling
Файл: `supabase/functions/sync-payments-with-statement/index.ts`

Было:
```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

Стало:
```ts
import { createClient } from "npm:@supabase/supabase-js@2";
```

Ничего больше в логике функции не трогаем.

---

### PATCH-2 (BLOCKER): Зарегистрировать функцию в `supabase/config.toml`
Файл: `supabase/config.toml`

Добавить (в конец или рядом с другими функциями):
```toml
[functions.sync-payments-with-statement]
verify_jwt = false
```

Почему false:
- Функция уже делает ручной auth-check по заголовку Authorization
- И делает RBAC через `has_role` (admin/superadmin)

---

### PATCH-3 (BLOCKER): Явный деплой только этой функции
Выполнить деплой строго одной функции:
- `supabase--deploy_edge_functions: ["sync-payments-with-statement"]`

STOP-guard:
- Если деплой снова падает с “Bundle generation timed out” — останавливаемся и НЕ трогаем другие функции.
- Тогда следующий шаг будет отдельным согласованным PATCH (например, замена/упрощение зависимостей, исключение тяжёлых импортов), но не “массовая” чистка.

---

## 2) Верификация (DoD только фактами)

### DoD-1: HTTP / Network (главное)
1) Открыть `/admin/payments`
2) Запустить «Синхронизация с Выпиской bePaid» → «Проверить (Dry-run)»
3) В DevTools → Network найти запрос:
- `.../functions/v1/sync-payments-with-statement`
- **Status: 200**
- Response: JSON с `success: true` и `stats`/`changes` (не важно сколько записей, важно что это не 404/не transport error)

Артефакт: скрин Network (Request URL + Status + кусок Response).

---

### DoD-2: UI
На той же странице:
- модалка переходит из “Ошибка” в “Preview” (показывает списки create/update/delete или хотя бы корректный empty-state без красной ошибки).
Артефакт: UI‑скрин из аккаунта **7500084@gmail.com** с видимым результатом (не toast с ошибкой).

---

### DoD-3: RBAC регрессия (безопасность)
Проверка с НЕ‑админ пользователем:
- Ожидаемо: **403** (или 401 если нет сессии), но не 200.
Пояснение:
- Это гарантирует, что синхронизация выписки не доступна любому пользователю.

Артефакт: скрин Network с 403/401 на том же эндпоинте для обычного пользователя (без секретов).

---

### DoD-4: Regression check
Проверить, что другая функция, например `telegram-admin-chat`, продолжает отвечать как раньше (401/200 в зависимости от прав), то есть деплой точечный и ничего не сломал.

---

## 3) Diff-summary (что поменяется)
- `supabase/functions/sync-payments-with-statement/index.ts`
  - 1 строка: `esm.sh` → `npm:`
- `supabase/config.toml`
  - + секция `[functions.sync-payments-with-statement] verify_jwt=false`
- Деплой: только `sync-payments-with-statement`

---

## 4) Почему это должно решить проблему
- Сейчас UI падает с transport error потому что функция фактически отсутствует (404).
- Регистрация в config + явный деплой устраняет 404.
- Замена `esm.sh` → `npm:` снижает вероятность “Bundle generation timed out” на этапе bundling/deploy.