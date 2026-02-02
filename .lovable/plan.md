План: Исправление Nightly 401 + bePaid Autopay Processing + Mismatch Orders (v2)

РЕЗЮМЕ ДИАГНОСТИКИ

Проблема 1: Nightly 401

Факт	Значение
job 25 (старый)	слал x-cron-secret = current_setting(...), но setting был NULL → 401
job 27 (текущий)	работает через hardcoded anon key (плохо, убрать)
Корень	DB setting app.settings.cron_secret не установлен / не доступен для сессии CRON

Проблема 2: Reconciler “not_found_in_bepaid”

Факт	Значение
Endpoint	GET /transactions?tracking_id=...
Подозрение	не хватает обязательных заголовков версии API
Риск	“пустой список” может быть не «нет транзакции», а «не та версия API»

Проблема 3: Mismatch orders

order_status	payment_status	Кол-во
paid	processing	6
paid	failed	14
Итого		20


⸻

PATCH-1: Nightly CRON — поставить DB setting + нормальный CRON header

1) Установить DB setting (PERSISTENT)

ALTER DATABASE postgres SET app.settings.cron_secret = '<CRON_SECRET_VALUE>';

2) DoD (правильный, без “ложного успеха” из-за старой сессии)

2.1. Проверка, что setting реально записан в catalog:

SELECT datname, unnest(datconfig) AS cfg
FROM pg_database
WHERE datname='postgres'
  AND unnest(datconfig) LIKE 'app.settings.cron_secret=%';

2.2. Проверка current_setting (только после reconnect/новой сессии):

SELECT current_setting('app.settings.cron_secret', true) IS NOT NULL AS secret_set;

3) Пересоздать CRON job (убрать anon key вариант)

SELECT cron.unschedule('nightly-system-health-hourly');

SELECT cron.schedule(
  'nightly-system-health-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/nightly-system-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := jsonb_build_object('source', 'cron-hourly', 'target_tz', 'Europe/London', 'target_hour', 3)
  );
  $$
);

4) DoD (Nightly реально перестал 401)

-- CRON реально зовёт функцию (не 401)
SELECT created, status_code, left(content::text, 120) AS content_preview
FROM net._http_response
WHERE created >= now() - interval '2 hours'
  AND (content::text ILIKE '%nightly%' OR content::text ILIKE '%skipped%' OR content::text ILIKE '%run_id%')
ORDER BY created DESC
LIMIT 5;

-- system_health_runs появляются
SELECT id, status, created_at, source
FROM system_health_runs
ORDER BY created_at DESC
LIMIT 5;

Требуется от владельца: значение CRON_SECRET из Edge secrets.

⸻

PATCH-2: Reconciler — добавить заголовки версии API + Accept

Файл: supabase/functions/admin-reconcile-processing-payments/index.ts

Станет:

const resp = await fetch(`https://gateway.bepaid.by/transactions?tracking_id=${payment.id}`, {
  method: 'GET',
  headers: {
    'Authorization': `Basic ${bepaidAuth}`,
    'Accept': 'application/json',
    'X-Api-Version': '3',
  },
});

Fallback (если “transactions: []”): повторить запрос с X-Api-Version: 2 (в рамках PATCH-4 теста), и только потом делать вывод “не существует”.

DoD:
	•	dry-run reconciler возвращает по хотя бы 1 tracking_id не not_found_in_bepaid (если в bePaid реально есть запись).
	•	если всё равно пусто — это уже доказательство “не создано”.

⸻

PATCH-3: Mismatch Orders — корректный отчёт + needs_review (без ручных UUID)

3.1 Сначала построить mismatch report двумя джойнами, чтобы не промахнуться схемой

A) через payments_v2.order_id

SELECT
  o.id AS order_id,
  o.order_number,
  o.status AS order_status,
  o.final_price,
  p.id AS payment_id,
  p.status AS payment_status,
  p.amount AS payment_amount,
  p.provider_payment_id,
  p.created_at AS payment_created
FROM payments_v2 p
JOIN orders_v2 o ON o.id = p.order_id
WHERE o.status = 'paid'
  AND p.status <> 'succeeded'
ORDER BY p.created_at DESC;

B) через orders_v2.payment_id (если поле существует и используется)

SELECT
  o.id AS order_id,
  o.order_number,
  o.status AS order_status,
  o.final_price,
  p.id AS payment_id,
  p.status AS payment_status,
  p.amount AS payment_amount,
  p.provider_payment_id,
  p.created_at AS payment_created
FROM orders_v2 o
JOIN payments_v2 p ON p.id = o.payment_id
WHERE o.status = 'paid'
  AND p.status <> 'succeeded'
ORDER BY p.created_at DESC;

DoD: оба запроса дают согласуемое число/пересечение, либо явно видно какая связь “истинная”.

3.2 Проставить флаг needs_review (guarded)

(используем тот JOIN, который по факту работает в вашей модели; ниже — вариант A)

UPDATE orders_v2 o
SET meta = COALESCE(o.meta, '{}'::jsonb) || jsonb_build_object(
  'needs_review', true,
  'review_reason', 'payment_status_mismatch',
  'flagged_at', now()::text
)
WHERE o.id IN (
  SELECT o2.id
  FROM payments_v2 p2
  JOIN orders_v2 o2 ON o2.id = p2.order_id
  WHERE o2.status = 'paid'
    AND p2.status <> 'succeeded'
);

DoD:

SELECT COUNT(*) 
FROM orders_v2
WHERE meta->>'needs_review' = 'true';
-- Ожидание: 20 (или фактическое число из отчёта)


⸻

PATCH-4: Контрольный тест bePaid по tracking_id (два варианта версии)

Цель: доказать, что поиск работает и что “пусто” = реально не создано.

# v3
curl -X GET "https://gateway.bepaid.by/transactions?tracking_id=0ba64777-b62a-4b08-977b-0804bd821672" \
  -H "Authorization: Basic $(echo -n '33524:<BEPAID_SECRET_KEY>' | base64)" \
  -H "Accept: application/json" \
  -H "X-Api-Version: 3"

Если transactions пустой → повторить:

# v2 fallback
curl -X GET "https://gateway.bepaid.by/transactions?tracking_id=0ba64777-b62a-4b08-977b-0804bd821672" \
  -H "Authorization: Basic $(echo -n '33524:<BEPAID_SECRET_KEY>' | base64)" \
  -H "Accept: application/json" \
  -H "X-Api-Version: 2"

DoD: получаем либо транзакцию, либо стабильный “пусто” на обеих версиях (тогда “не создано” доказано).

⸻

EXECUTE: порядок выполнения
	1.	PATCH-1: получить CRON_SECRET → ALTER DATABASE ... SET → пересоздать nightly CRON без anon key
	2.	PATCH-2: добавить X-Api-Version (+ Accept) в reconciler
	3.	PATCH-4: контрольный tracking_id (v3 + v2) → фиксируем факт “есть/нет”
	4.	PATCH-3: mismatch report (A/B) → needs_review=true
	5.	Запуск reconciler:
	•	сначала execute=false (dry-run)
	•	затем execute=true (по лимитам/батчам)

⸻

Итоговые DoD (обязательные)

A) Nightly перестал 401
	•	net._http_response.status_code=200 для nightly вызовов
	•	появились новые system_health_runs от cron-hourly (или skipped на нецелевом часу)

B) bePaid reconcile корректен
	•	dry-run reconciler по контрольному tracking_id показывает статус или доказуемое “пусто” (v3+v2)
	•	после execute:

SELECT COUNT(*) 
FROM payments_v2
WHERE status='processing'
  AND created_at >= '2026-02-02';
-- Ожидание: 0 (или объяснимый остаток: pending_3ds/прочее, если такой статус существует)

C) mismatch заказы помечены

SELECT COUNT(*)
FROM orders_v2
WHERE meta->>'needs_review'='true';
-- Ожидание: = количеству mismatch из отчёта


⸻

Требуется от владельца
	1.	Значение CRON_SECRET (для DB setting)
	2.	Разрешение на reconcile execute=true (после dry-run и контрольного tracking_id)