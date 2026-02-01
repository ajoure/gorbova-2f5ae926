
План v3.1 (исправленный): Предзаписи «Бухгалтерия как бизнес» — Статусы + Биллинг + Доступ

Ключевые корректировки к твоему резюме
	1.	course_preregistrations может иметь meta, но в твоём тексте ты пишешь “нет поля meta” — ок, добавляем, но делаем это без тяжёлого DEFAULT и с правильным индексом по meta.billing.billing_status.
	2.	UI “paid/converted”: сейчас у тебя “converted → Оплачено”, но в данных может быть paid. Нужно:
	•	либо нормализовать статусы в БД (converted→paid),
	•	либо оставить оба как “Оплачено”, но тогда таб “Оплаченные” должен учитывать оба.
	3.	Индекс у тебя неправильный: meta->>'billing_status' не соответствует структуре meta.billing.billing_status.
	4.	telegram_logs: ты предполагаешь поля (action, event_type, status, message_text) — нельзя хардкодить без проверки схемы. Нужно сначала SELECT column_name... и дальше писать в реально существующие поля (чаще всего — event_type + meta jsonb + payload).
	5.	updatePreregBilling: нельзя делать SELECT meta на каждой итерации — будет N+1. Делай одноразовый update jsonb через SQL выражения, либо заранее держи meta в памяти.

⸻

PATCH-1: Добавить meta jsonb в course_preregistrations (BLOCKER) — безопасная миграция

Правильная миграция (минимум локов)

ALTER TABLE course_preregistrations
ADD COLUMN IF NOT EXISTS meta jsonb;

-- (опционально) backfill только NULL
UPDATE course_preregistrations
SET meta = '{}'::jsonb
WHERE meta IS NULL;

-- Индекс именно по meta.billing.billing_status
CREATE INDEX IF NOT EXISTS idx_prereg_billing_status
ON course_preregistrations ((meta->'billing'->>'billing_status'));

-- SYSTEM ACTOR proof (как у тебя принято)
INSERT INTO audit_logs (action, actor_type, actor_user_id, actor_label, meta)
VALUES (
  'schema.course_preregistrations_meta_added',
  'system',
  NULL,
  'patch-buh_business-schema',
  '{"change":"added meta jsonb; index meta.billing.billing_status"}'::jsonb
);

✅ Почему так: DEFAULT '{}'::jsonb на ADD COLUMN иногда даёт лишнюю нагрузку/перепаковку. Тут безопаснее.

⸻

PATCH-2: UI-локализация статусов (BLOCKER) — да, но добавь ещё нормализацию

Твои правки по statusConfig и statusOptions — ок.

Добавляю обязательную логику:
	•	В таблице предзаписей показывать “Оплачено”, если:
	•	status IN ('paid','converted') ИЛИ
	•	meta.billing.billing_status='paid'

Иначе ты снова увидишь “Новая” рядом с paid.

⸻

PATCH-2.1 (рекомендую): Нормализовать converted → paid в БД (чтобы не жить с 2 статусами)

-- dry-run
SELECT status, count(*)
FROM course_preregistrations
WHERE product_code='buh_business'
GROUP BY status;

-- execute
UPDATE course_preregistrations
SET status='paid', updated_at=NOW()
WHERE product_code='buh_business'
  AND status='converted';

INSERT INTO audit_logs (action, actor_type, actor_user_id, actor_label, meta)
VALUES (
  'preregistration.status_normalized',
  'system',
  NULL,
  'patch-buh_business-status-normalize',
  '{"from":"converted","to":"paid","product_code":"buh_business"}'::jsonb
);


⸻

PATCH-3: Табы Новые/Оплаченные/Просроченные (HIGH) — пересчёт через SQL, не через .select(meta) в память

Твой useQuery сейчас тянет все записи и считает на фронте — будет медленно и дорого.

Правильно: сделать 3 count запроса (или один RPC/SQL) с условиями.

Пример на Supabase SQL (идея, под Lovable):

-- paid
SELECT count(*) FROM course_preregistrations
WHERE product_code='buh_business'
  AND (status IN ('paid','converted')
       OR (meta->'billing'->>'billing_status')='paid');

-- overdue (no_card/failed/overdue)
SELECT count(*) FROM course_preregistrations
WHERE product_code='buh_business'
  AND (meta->'billing'->>'billing_status') IN ('overdue','no_card','failed');

-- pending (всё остальное “живое”)
SELECT count(*) FROM course_preregistrations
WHERE product_code='buh_business'
  AND status NOT IN ('paid','converted','cancelled')
  AND COALESCE((meta->'billing'->>'billing_status'),'pending') NOT IN ('paid','overdue','no_card','failed');


⸻

PATCH-4: Billing-панель в карточке (HIGH) — ок, но добавь Email + даты

Ты показываешь только TG ✓/—. Нужно минимум:
	•	tomorrow_charge_at
	•	no_card_at
	•	failed_at
	•	(если есть email) email_*_at

Иначе админ не поймёт “какое уведомление ушло”.

⸻

PATCH-5: preregistration-charge-cron пишет billing meta (BLOCKER) — исправляю архитектуру updatePreregBilling

Твоя версия делает SELECT meta на каждую запись → N+1.

Корректный подход: обновлять jsonb “на месте” одной командой.
Пример паттерна (идея; Lovable адаптирует под Deno supabase):
	•	читать meta один раз вместе с prereg выборкой (select meta),
	•	обновлять без повторного select.

Правильное формирование структуры

Храни строго как:
meta.billing.billing_status и т.д.
Не “meta->>‘billing_status’”.

⸻

PATCH-5.1: “Overdue” логика — твой вариант опасен

Ты предлагаешь: “если dayOfMonth > chargeWindowEnd — пройтись по всем и проставить overdue” — это риск:
	•	лишние апдейты,
	•	может пометить тех, кто оплатил вне статуса,
	•	нагрузка в каждый запуск.

Правильно:
	•	overdue ставить на конкретной prereg, если:
	•	billing_status != paid
	•	и сегодня уже после окна
	•	и (нет карты или были попытки и failed)

Т.е. overdue — это состояние проблемного биллинга, а не просто “наступило 5 число”.

⸻

PATCH-6: Логи в telegram_logs (HIGH) — сначала проверить схему

Перед вставками нужно сделать:

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name='telegram_logs'
ORDER BY ordinal_position;

И дальше писать в реально существующие поля.
Без этого Lovable опять “придумает” колонки и всё упадёт.

Рекомендация по унификации:
	•	event_type:
	•	preregistration_tomorrow_charge
	•	preregistration_no_card
	•	preregistration_payment_success
	•	preregistration_payment_failed
	•	meta: { preregistration_id, product_code, amount, currency, error }
	•	message_text: только если колонка реально есть. Если нет — в meta.message_text.

⸻

PATCH-7/9: ContactTelegramChat + ContactDetailSheet — фильтровать по event_type, не по action

Ты сейчас предлагаешь .or("action.in.(...)"). Это хрупко.

Правильнее: фильтровать по event_type LIKE 'preregistration_%' (если есть event_type), либо по meta->>'preregistration_id' is not null.

⸻

PATCH-8: Доступ к модулю/урокам (BLOCKER) — не “проверить”, а обеспечить DoD

Ты пишешь “уже реализовано invoke grant-access-for-order” — но по факту нужно DoD:
	1.	Есть paid order → создан/продлён entitlement/subscription
	2.	module_access связывает tariff ↔ module
	3.	У пользователя реально появился модуль/уроки (UI факт)

Минимальный SQL guard

-- Проверить связку module_access для тарифа buh_business
SELECT tm.id as module_id, tm.title, ma.tariff_id
FROM training_modules tm
LEFT JOIN module_access ma ON ma.module_id = tm.id
WHERE tm.slug='buhgalteriya-kak-biznes' OR tm.title ILIKE '%как бизнес%';

-- Если нет строки в module_access — добавить (execute после подстановки module_id)
INSERT INTO module_access (module_id, tariff_id)
VALUES ('<MODULE_ID>', 'c5981337-242b-49e8-8c99-64ccf8fac13e')
ON CONFLICT DO NOTHING;


⸻

Обязательные DoD (добавляю к твоим)
	11.	✅ В табе “Оплаченные” нет ни одной строки со статусом “Новая” при paid/converted/meta.billing.paid.
	12.	✅ “Просроченные” показывают причину: no_card / failed / overdue + last_error.
	13.	✅ Для 1 тестового пользователя: “cron списал” → “order paid” → “доступ к модулю открыт” (скрин + SQL-пруф).

⸻

Копируемые ключевые правки для твоего ТЗ (коротко)
	•	Исправить индекс: ((meta->'billing'->>'billing_status')), а не meta->>'billing_status'.
	•	Не делать N+1 select в updatePreregBilling.
	•	Счётчики сегментов считать SQL’ом, не выкачивать все prereg в UI.
	•	telegram_logs: сначала проверить схему, потом вставки; унифицировать через event_type='preregistration_*' + meta.
	•	Нормализовать converted → paid (рекомендовано), иначе вечно будут расхождения.
	•	Overdue не ставить “всем после 4 числа”, а только проблемным prereg.
	•	DoD по доступу: фактический доступ к модулю/урокам после оплаты.

