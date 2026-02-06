

Главные правки:
	•	CORS-пруф неверный: Allow-Methods: POST — этого недостаточно. Для browser + Authorization нужен POST, OPTIONS (и часто ещё GET, OPTIONS, если где-то GET).
	•	DoD по “не-админ” неверный: “не-админ: 401” — неправильно. Если токен есть, но прав нет → 403.
	•	Нужен CI STOP-guard: деплой не может считаться успешным без smoke-проверки OPTIONS и POST.

⸻


# TIER-1 Critical Fix v2: Deploy `payment-method-verify-recurring` + Stop Silent Regression

## Executive Summary

**Root Cause (доказано):**
- Функция `payment-method-verify-recurring` зарегистрирована в `supabase/config.toml` (line 270-271)
- Код существует: `supabase/functions/payment-method-verify-recurring/index.ts`
- **На production функции нет** → возвращает `{"code":"NOT_FOUND"}`

**Почему “чинится и снова ломается”:**
- деплой не был гарантирован (CI может “проглотить” ошибки, или деплой не запускается для конкретной функции)
- CORS/OPTIONS должны быть проверены как часть DoD (иначе UI покажет “Load failed”, даже если функция существует)

---

## Network Proof (факт)

| Field | Value |
|------|-------|
| Request URL | `https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/payment-method-verify-recurring` |
| Method | `POST` |
| Status | **404** |
| Response | `{"code":"NOT_FOUND","message":"Requested function was not found"}` |
| Time | 2026-02-05 23:56:48 UTC |

---

## CORS / OPTIONS Requirements (DoD)

Для UI вызовов (browser + Authorization) обязательно:
- `OPTIONS` → **204/200** + CORS headers
- `Access-Control-Allow-Methods` MUST include: **`POST, OPTIONS`**
- `Access-Control-Allow-Headers` MUST include: `authorization, apikey, content-type, x-client-info, x-supabase-client-*`

> Примечание: “Allow-Methods: POST” — НЕ ок. Preflight может требовать OPTIONS.

---

## Implementation Plan

### STEP 1 — Deploy the function (no code change unless missing in CI list)

Command:
```bash
supabase functions deploy payment-method-verify-recurring --project-ref hdjgkjceownmmnrqqtuz

STOP-guard: если после деплоя POST всё ещё 404 → деплой не дошёл до нужного проекта или имя/путь не совпадает.

⸻

STEP 2 — Smoke-check (MUST, with OPTIONS + POST)

2.1 OPTIONS smoke:

curl -i -X OPTIONS \
  https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/payment-method-verify-recurring \
  -H "Origin: https://796a93b9-74cc-403c-8ec5-cafdb2a5beaa.lovableproject.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, apikey, content-type"

Expected (DoD):
	•	status 200/204
	•	headers include:
	•	Access-Control-Allow-Origin
	•	Access-Control-Allow-Methods contains POST, OPTIONS
	•	Access-Control-Allow-Headers contains authorization, apikey, content-type (и лучше полный список)

2.2 POST smoke (no token):

curl -i -X POST \
  https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/payment-method-verify-recurring \
  -H "Content-Type: application/json" \
  -d '{}'

Expected:
	•	НЕ {"code":"NOT_FOUND"...}
	•	допустимо: 401 / 400 / 403 (любое означает “функция существует”)

⸻

STEP 3 — Security Matrix (DoD exact)

3.1 без токена → 401 Unauthorized
	•	Expected body includes code like MISSING_TOKEN / UNAUTHORIZED

3.2 с JWT обычного пользователя (не admin/superadmin) → 403 Forbidden
	•	Expected: INSUFFICIENT_PERMISSIONS

3.3 superadmin (7500084@gmail.com):
	•	200 (dry_run результаты) или 400 (если не хватает параметров)
	•	но НЕ 404 и НЕ “Load failed”

⸻

STEP 4 — UI Verification
	1.	открыть /admin/payments/diagnostics
	2.	нажать “Проверить (dry-run)”
	3.	открыть DevTools → Network:
	•	увидеть payment-method-verify-recurring (POST) → 200/400/401/403
	•	увидеть OPTIONS (если был preflight) → 200/204
	4.	убедиться: нет “Edge Function returned…” / “Failed to fetch”

⸻

CI Hardening (чтобы не отваливалось снова)

Обязательная правка: после деплоя добавляем smoke-check в workflow и падаем, если:
	•	endpoint вернул 404 NOT_FOUND
	•	OPTIONS не возвращает Allow-Methods POST, OPTIONS

Минимально (псевдо):
	•	deploy function
	•	curl OPTIONS + grep Allow-Methods
	•	curl POST + assert not NOT_FOUND
	•	FAIL если не так

⸻

DoD Checklist

Check	Expected
OPTIONS	200/204 + Allow-Methods: POST, OPTIONS
POST без токена	401
POST с non-admin JWT	403
POST с superadmin	200/400
UI “Проверка карт”	no “Edge Function returned…”
No NOT_FOUND anywhere	true


⸻

Note (non-blocker): bepaid-list-subscriptions 18s

Не блокер, но зафиксировать как PERF PATCH:
	•	pagination
	•	caching
	•	параллелизация

