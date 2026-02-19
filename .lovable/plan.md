
# Исправление аутентификации hoster.by: двухшаговый OAuth-flow

## Корневая причина UNAUTHORIZED

Изучив официальную документацию (`serviceapi.hoster.by/docs/swagger/json` и все три страницы помощи), установлено:

**hoster.by API использует двухшаговую аутентификацию:**

Шаг 1 — получить JWT access token:
```
POST https://serviceapi.hoster.by/service-account/token/create
Headers:
  Access-Key: {cloud_access_key}
  Secret-Key: {cloud_secret_key}

Response:
{
  "payload": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "userId": 12345,
    "dateExpires": 1700000000
  }
}
```

Шаг 2 — использовать JWT для всех запросов:
```
GET https://serviceapi.hoster.by/cloud/orders
Headers:
  Authorization: Bearer {accessToken}
```

**Текущая ошибка:** `hosterRequest` пытается передавать `Access-Key` напрямую как Bearer/HMAC — это неверно. API возвращает 401 при всех трёх попытках, что UI показывает как `UNAUTHORIZED`.

**HMAC-подпись (`X-API-KEY + X-API-SIGN`)** — выдуманная схема, не существует в официальном Swagger.

---

## Архитектура решения

```text
UI (кнопка "Проверить подключение")
    ↓ save_hoster_keys (dry_run=true) / test_connection
    ↓
hosterby-api edge function
    ├── Step 1: POST /service-account/token/create
    │           Headers: Access-Key + Secret-Key
    │           → accessToken (JWT)
    │
    └── Step 2: GET /cloud/orders
                Headers: Authorization: Bearer {accessToken}
                → orders_count
```

Access Token имеет срок действия (`dateExpires`). Для `test_connection` и `dry_run` получаем его "на лету". При сохранении ключей — сохранять только Access Key и Secret Key (не JWT, так как он протухает).

---

## Изменяемые файлы

Только один файл: `supabase/functions/hosterby-api/index.ts`

---

## Детальные изменения

### Изменение 1 — Добавить функцию `getAccessToken`

Новая функция `getAccessToken(accessKey, secretKey)` — выполняет Шаг 1:

```typescript
interface HosterTokenResult {
  ok: boolean;
  accessToken?: string;
  userId?: number;
  dateExpires?: number;
  error?: string;
  code?: HosterCode;
}

async function getAccessToken(
  accessKey: string,
  secretKey: string,
  timeoutMs = 15000
): Promise<HosterTokenResult> {
  const url = `${HOSTERBY_API_BASE}/service-account/token/create`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Access-Key": accessKey,
        "Secret-Key": secretKey,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    const text = await resp.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch {
      return { ok: false, error: "Невалидный JSON от /service-account/token/create", code: "HOSTERBY_520" };
    }

    const httpCode = (data as any)?.httpCode;

    if (resp.status === 401 || httpCode === 401) {
      return { ok: false, error: "Неверные ключи (Access-Key или Secret-Key)", code: "UNAUTHORIZED" };
    }

    if (httpCode === 520) {
      const errMsg = (data as any)?.messageList?.error?.unknown_error ?? "";
      if (errMsg.includes("Matched route") || errMsg.includes("handler")) {
        return { ok: false, error: "Маршрут /service-account/token/create не найден", code: "HOSTERBY_ROUTE_MISSING" };
      }
      return { ok: false, error: `hoster.by 520: ${errMsg}`, code: "HOSTERBY_520" };
    }

    if (httpCode === 200 && (data as any)?.statusCode === "ok") {
      const payload = (data as any)?.payload;
      const accessToken = payload?.accessToken as string | undefined;
      if (!accessToken) {
        return { ok: false, error: "accessToken отсутствует в ответе", code: "HOSTERBY_520" };
      }
      return {
        ok: true,
        accessToken,
        userId: payload?.userId,
        dateExpires: payload?.dateExpires,
      };
    }

    return { ok: false, error: `Неожиданный ответ: httpCode=${httpCode}, status=${resp.status}`, code: "NETWORK_ERROR" };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: "Timeout при получении access token", code: "TIMEOUT" };
    }
    return { ok: false, error: String(e), code: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}
```

### Изменение 2 — Переработать `hosterRequest` для Шага 2

`hosterRequest` теперь принимает уже готовый `accessToken` (JWT), а не Access Key + Secret Key. Заголовок только `Authorization: Bearer {accessToken}`:

```typescript
async function hosterRequest(
  method: string,
  path: string,
  body: string,
  accessToken: string,      // JWT от getAccessToken()
  timeoutMs = 15000
): Promise<HosterResult> {
  return attemptHosterRequest(method, path, body, {
    "Authorization": `Bearer ${accessToken}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
  }, timeoutMs).then(result => {
    if (result.error === "TIMEOUT") {
      return { ...result, code: "TIMEOUT" as HosterCode, auth_mode_used: "bearer" };
    }
    const bodyNorm = normalizeHosterBody(result.data);
    if (bodyNorm?.ok) return { ...result, code: "OK" as HosterCode, auth_mode_used: "bearer" };
    if (bodyNorm) return { ...result, ok: false, code: bodyNorm.code, auth_mode_used: "bearer" };
    if (result.status === 401 || result.status === 403) {
      return { ...result, ok: false, code: "UNAUTHORIZED" as HosterCode, auth_mode_used: "bearer" };
    }
    if (result.ok) return { ...result, code: "OK" as HosterCode, auth_mode_used: "bearer" };
    return { ...result, code: "NETWORK_ERROR" as HosterCode, auth_mode_used: "bearer" };
  });
}
```

**Старый `hosterRequest` с тремя попытками (HMAC + Bearer + Access-Token header) — удалить полностью**, заменить на новую версию.

### Изменение 3 — Обновить `test_connection`

Добавить Шаг 1 перед Шагом 2:

```typescript
case "test_connection": {
  if (!accessKey || !secretKey) {
    return jsonResp({ success: false, error: "API ключи не настроены", code: "KEYS_MISSING" });
  }

  // Шаг 1: получить JWT
  const tokenResult = await getAccessToken(accessKey, secretKey);
  if (!tokenResult.ok || !tokenResult.accessToken) {
    return jsonResp({
      success: false,
      code: tokenResult.code ?? "NETWORK_ERROR",
      error: tokenResult.error ?? "Ошибка получения токена",
      endpoint_used: "/service-account/token/create",
      auth_mode_used: "two-step",
    });
  }

  // Шаг 2: GET /cloud/orders с JWT
  const result = await hosterRequest("GET", "/cloud/orders", "", tokenResult.accessToken);
  // ... парсинг orders_count как сейчас
}
```

### Изменение 4 — Обновить `save_hoster_keys`

Аналогично: Шаг 1 → JWT → Шаг 2 → orders_count. Ключи в БД хранить как сейчас (Access Key + Secret Key), не хранить JWT.

### Изменение 5 — Убрать `buildHosterSignature`, `computeMd5`, тройную попытку

- Весь HMAC-signing код (функции `computeMd5`, `buildHosterSignature`, старый `hosterRequest` с тремя попытками) — удалить.
- `encodeBase64` больше не нужен — удалить import.
- `md5Base64` — удалить.
- `runSigningTests` — удалить (тесты были для несуществующей схемы).
- Условие `if (Deno.env.get("HOSTERBY_SIGN_TESTS") === "1")` — удалить.

### Изменение 6 — Обновить `normalizeHosterBody`

Оставить как есть (корректно распознаёт httpCode=200/ok, 520, 401/403).

### Изменение 7 — Обновить ответы `auth_mode_used`

Везде где возвращается `auth_mode_used` — заменить значение на `"two-step"` (Step1: Access-Key/Secret-Key → JWT, Step2: Bearer JWT).

---

## Что НЕ трогаем

- `by_egress_check_health`, `by_egress_test_url`, `by_egress_save_config`, `by_egress_toggle` — не связаны с hoster.by auth
- `src/components/integrations/hosterby/HosterByConnectionDialog.tsx` — UI показывает `auth_mode_used` из ответа, поле уже есть
- `supabase/functions/integration-healthcheck/index.ts` — не трогаем
- `supabase/functions/monitor-news/index.ts` — не трогаем
- Все другие интеграции

---

## DoD

**A)** После деплоя: `save_hoster_keys` с реальными ключами вернёт `code: "OK"` + `orders_count: N` + `auth_mode_used: "two-step"` (вместо `UNAUTHORIZED`).

**B)** Кнопка "Проверить подключение" в UI покажет: `✅ Ключи валидны! Облаков: N (режим: two-step)`.

**C)** В логах `hosterby-api`: нет stacktrace, есть запись `action=save_hoster_keys ... auth_mode_used=two-step endpoint_used=/cloud/orders`.

**D)** SQL: `audit_logs` содержит запись `actor_type='system', actor_user_id IS NULL, actor_label='hosterby-api', action='hosterby.save_keys'`.

---

## Технические детали

**Почему JWT не кэшируем:** JWT от hoster.by — краткоживущий (dateExpires). Для UI-действий (test_connection, save_hoster_keys) получаем его "на лету" — это быстро (один HTTP запрос). Кэширование потребовало бы хранение JWT в БД и логику обновления — это вне скоупа данного спринта.

**Почему не хранить JWT:** JWT в `integration_instances.config` — плохая идея, он протухнет. Сохраняем только Access Key + Secret Key. При каждом запросе через edge function — двухшаговый flow.

**Единственный файл для изменения:** `supabase/functions/hosterby-api/index.ts` — это минимально инвазивное изменение согласно принципу add-only/minimal diff.
