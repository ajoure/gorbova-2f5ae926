## Жёсткие правила исполнения для Lovable.dev (обязательно)

1) **Ничего не ломать и не трогать лишнее.** Только изменения из PATCH.  
2) **Add-only / минимальный diff.** Любое удаление/рефактор — только если прямо указано.  
3) **Dry-run → execute.** Сначала проверка через curl/Network, потом деплой.  
4) **STOP-guards обязательны:** если 401/403/таймауты не сходятся с DoD — STOP и отчёт.  
5) **Безопасность:** `verify_jwt=false` допустим только при **ручном auth guard** внутри функции.  
6) **DoD только по фактам:** Network (headers + status), curl, скрин UI из админки `7500084@gmail.com`.  
7) **No-PII в логах.** Токены/секреты не логировать.

---

# PATCH: integration-healthcheck — auth guard (superadmin only) + timeout внешних вызовов

## Контекст / проблема

На `/admin/integrations/payments` при проверке bePaid падает запрос:
- Endpoint: `POST /functions/v1/integration-healthcheck`
- Ошибка в UI/Network: `Load failed` (обрыв/таймаут, не 404)

**Security issue:** функция **не ограничена по ролям** → любой аутентифицированный пользователь может вызвать healthcheck и получить чувствительную информацию о статусе интеграций.

Цель:  
1) сделать `integration-healthcheck` доступной **только superadmin**  
2) сделать таймауты fetch и вернуть **понятные ошибки**, а не “Load failed”

---

## PATCH-1: Добавить auth guard (superadmin only)

**Файл:** `supabase/functions/integration-healthcheck/index.ts`

### Требование
- guard должен стоять **после OPTIONS** (CORS preflight) и **до любых действий**.
- `verify_jwt` в config не меняем (может оставаться `false`), но **guard обязателен**.

### Реализация (вставить в начало handler после OPTIONS)

> Важно: используем **service role** клиент для RPC `has_role`, чтобы RLS не мешал.  
> Не логируем токен.

```ts
// After: if (req.method === "OPTIONS") return ...

// --- AUTH GUARD: superadmin only ---
const authHeader = req.headers.get("Authorization") ?? "";
if (!authHeader.startsWith("Bearer ")) {
  return new Response(
    JSON.stringify({ success: false, error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const token = authHeader.slice("Bearer ".length).trim();
const { data: userData, error: userError } = await supabase.auth.getUser(token);

if (userError || !userData?.user?.id) {
  return new Response(
    JSON.stringify({ success: false, error: "Invalid token" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const { data: isSuperAdmin, error: roleErr } = await supabase.rpc("has_role", {
  _user_id: userData.user.id,
  _role: "superadmin",
});

if (roleErr) {
  return new Response(
    JSON.stringify({ success: false, error: "Role check failed" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

if (isSuperAdmin !== true) {
  return new Response(
    JSON.stringify({ success: false, error: "Superadmin access required" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}


⸻

PATCH-2: Таймауты и нормальные ошибки для внешних API

Файл: supabase/functions/integration-healthcheck/index.ts

Требование
	•	каждый внешний fetch (bePaid / Kinescope / GetCourse / AmoCRM и т.д.) должен иметь:
	•	AbortController timeout 10s
	•	обработку AbortError → вернуть { success:false, error:"TIMEOUT", provider:"..." } (HTTP 504 или 200 с error — выбрать единый стиль, см. ниже)

Единый стиль ответов
	•	HTTP:
	•	guard ошибки: 401/403/500
	•	provider timeout: 504
	•	provider error: 502
	•	body:

{ "success": false, "provider": "bepaid", "error": "TIMEOUT" }

Хелпер (добавить один раз вверху файла)

async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

Заменить ВСЕ fetch

Было:

const response = await fetch(url, { ... });

Стало:

let response: Response;
try {
  response = await fetchWithTimeout(url, { ... }, 10000);
} catch (e: any) {
  const isAbort = e?.name === "AbortError";
  return new Response(
    JSON.stringify({ success: false, provider: "bepaid", error: isAbort ? "TIMEOUT" : "FETCH_FAILED" }),
    { status: isAbort ? 504 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Применить аналогично для всех провайдеров внутри healthcheck.

⸻

PATCH-3: Деплой функции

supabase--deploy_edge_functions: ["integration-healthcheck"]


⸻

DoD (проверка по фактам)

Security
	1.	curl без токена:

curl -i -X POST "https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/integration-healthcheck" \
  -H "Content-Type: application/json" \
  -d '{}'

Ожидаем: 401
	2.	пользователь без superadmin (через браузер Network или curl с его JWT): 403
	3.	superadmin (7500084@gmail.com): 200 (или 502/504, но НЕ 401/403)

Functionality
	4.	/admin/integrations/payments → “Проверить bePaid”:

	•	больше нет “Load failed”
	•	вместо этого: либо успешный статус, либо читабельная ошибка (TIMEOUT/FETCH_FAILED)
	•	Network: запрос НЕ падает на уровне браузера

Регрессия
	5.	CORS OPTIONS работает (preflight возвращает 200/204 как было).

⸻

Diff-summary
	•	supabase/functions/integration-healthcheck/index.ts
	•	+superadmin auth guard
	•	+fetchWithTimeout helper
	•	replace all fetch → fetchWithTimeout + abort handling

