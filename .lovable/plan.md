
# План исправления bePaid Preflight проверки

## Диагноз проблемы

| Факт | Данные |
|------|--------|
| Shop ID в БД | **33524** (правильный) ✓ |
| Secret Key | Задан (51206ca1b4..., 64 символа) ✓ |
| Реальные платежи | **579 успешных** за последний месяц ✓ |
| Preflight ошибка | `GET /shops/33524` → 400 "Shop not found" ✗ |

**Причина ошибки:** Endpoint `GET /shops/{id}` НЕ СУЩЕСТВУЕТ в публичном bePaid API Gateway. Этот endpoint, возможно, доступен только во внутреннем API bePaid или требует другой авторизации.

**Доказательство:** Все рабочие функции в проекте (`subscription-charge`, `direct-charge`, `payment-methods-tokenize` и другие) используют:
- `POST gateway.bepaid.by/transactions/payments` — для списаний
- `POST checkout.bepaid.by/ctp/api/checkouts` — для токенизации

Никто НЕ использует `GET /shops/{id}`.

---

## Решение: Изменить Preflight на проверку через тестовую авторизацию

### PATCH-A: Убрать несуществующий endpoint `/shops/{id}`

**Файл:** `supabase/functions/preregistration-charge-cron/index.ts`

**Было (строки 397-421):**
```typescript
// Step 1: Check shop exists via GET /shops/{id} — НЕ РАБОТАЕТ
const shopResponse = await fetch(`https://${host}/shops/${bepaidShopId}`, ...);
// ... падает с 400 "Shop not found"
```

**Станет:**
```typescript
// Step 1: Verify credentials via test authorization
// Using bePaid test card 4200000000000000 with test=true mode
// This validates both shop_id and secret_key are correct
const testPayload = {
  request: {
    amount: 1,
    currency: "BYN",
    description: "Preflight credentials check",
    test: true,
    credit_card: {
      number: "4200000000000000",
      exp_month: "12",
      exp_year: "2030",
      verification_value: "123",
    },
  },
};

const authResponse = await fetch(`https://${host}/transactions/authorizations`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${bepaidAuth}`,
    "Content-Type": "application/json",
    "X-API-Version": "2",
  },
  body: JSON.stringify(testPayload),
});
```

### PATCH-B: Обновить логику определения успеха

**Критерии успешного preflight:**
1. HTTP статус 200-201 на `/transactions/authorizations`
2. `transaction.status === "successful"` или отсутствие 401/403 ошибок
3. Если получили `successful` — значит credentials 100% рабочие

**Новая логика:**
```typescript
const authResult = await authResponse.json();

// Success criteria:
// - 200/201 status = credentials work
// - transaction.status = "successful" = full capability confirmed
// - 401/403 = credentials invalid

const isCredentialsValid = authResponse.status >= 200 && authResponse.status < 300;
const isChargeCapable = authResult.transaction?.status === "successful";

return {
  ok: isCredentialsValid,
  build_id: BUILD_ID,
  host_used: host,
  shop_id_masked: shopIdMasked,
  shop_id_source: shopIdSource,
  http_status: authResponse.status,
  transaction_status: authResult.transaction?.status,
  provider_check: isCredentialsValid ? "auth_test" : "auth_failed",
  charge_capability: isChargeCapable,
  provider_error: isCredentialsValid ? null : (authResult.errors?.base?.[0] || authResult.message || "Auth failed"),
};
```

---

## Технические детали

### Что делает тестовая авторизация

| Шаг | Описание |
|-----|----------|
| 1 | POST `/transactions/authorizations` с `test: true` |
| 2 | bePaid проверяет: shop_id существует? secret_key правильный? |
| 3 | Если да → создаёт тестовую авторизацию (не списывает реальные деньги) |
| 4 | Возвращает `transaction.status = "successful"` |
| 5 | Тестовые транзакции автоматически void'ятся bePaid |

### Ожидаемый ответ после исправления

```json
{
  "ok": true,
  "build_id": "prereg-cron:2026-02-02T...",
  "host_used": "gateway.bepaid.by",
  "shop_id_masked": "335**",
  "shop_id_source": "integration_instances",
  "http_status": 200,
  "transaction_status": "successful",
  "provider_check": "auth_test",
  "charge_capability": true
}
```

---

## Изменяемый файл

| Файл | Изменения |
|------|-----------|
| `supabase/functions/preregistration-charge-cron/index.ts` | Функция `runPreflight()`: убрать GET /shops, оставить только тестовую авторизацию |

---

## DoD после исправления

1. **Preflight HTTP-ответ:**
   - `ok: true`
   - `charge_capability: true`
   - `shop_id_masked: 335**`
   - `provider_check: "auth_test"`

2. **Логи Edge Function:**
   - `[BUILD_ID] Preflight result: ok=true, charge_capability=true`

3. **SQL-пруф credentials:**
```sql
SELECT 
  config->>'shop_id' as shop_id,
  LENGTH(config->>'secret_key') as secret_key_length
FROM integration_instances 
WHERE provider = 'bepaid' AND status = 'connected';
-- Ожидание: shop_id=33524, secret_key_length=64
```
