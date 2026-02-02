# Спринт: Исправление BLOCKER’ов bePaid Payments (v2 — исправленный план)

## Жёсткие правила исполнения для Lovable.dev
1) Ничего не ломать и не трогать лишнее. Только по плану.  
2) Add-only где возможно, минимальный diff.  
3) Dry-run → execute во всех массовых операциях.  
4) STOP-guards обязательны (лимиты, батчи, max rows).  
5) No-PII в логах и audit_logs (никаких last4/holder/email/phone).  
6) DoD только по фактам: UI-скрины/видео из админ-аккаунта 7500084@gmail.com + логи Edge + SQL-пруфы + diff-summary.

---

## Контекст проблем (BLOCKER)
### BLOCKER-1: backfill по last4+brand запрещён
- Last4 не уникален → риск массово связать чужие платежи.
- Текущий RPC `backfill_payments_by_card(last4+brand)` удалить/задепрекейтить.  
- Также **запрещён** `GRANT EXECUTE ... TO authenticated` для массовых RPC.

### BLOCKER-2: /admin/payments грузит всё (нет server-side pagination)
- `fetchAllPages()` загружает всё за период → медленно, память, UI лагает.
- UI slice = не решение.

---

## Цель спринта
1) Корректная и безопасная автопривязка платежей к профилю по **стабильному идентификатору карты** (token/fingerprint/provider_card_id).  
2) Server-side pagination + server-side totals/stats (независимо от страницы).  
3) Стабильная синхронизация со сверкой (батчи, retry) и нормальная explain-диагностика.

---

## PATCH-лист (7 пунктов, все обязательные)

### PATCH-1: Card identity → provider_token (или fingerprint) как первичный ключ (BLOCKER)
**1A. Миграция: расширить `card_profile_links`**
- Добавить колонку `provider_token TEXT NULL` (ключ карты от bePaid).
- Индекс по token.
- Уникальность: `UNIQUE (provider, provider_token)` с условием `provider_token IS NOT NULL`.
- Никаких last4/holder в уникальных ключах.

**SQL (миграция):**
```sql
ALTER TABLE public.card_profile_links
  ADD COLUMN IF NOT EXISTS provider_token text;

CREATE INDEX IF NOT EXISTS idx_card_profile_links_provider_token
  ON public.card_profile_links (provider, provider_token)
  WHERE provider_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'card_profile_links_provider_token_uniq'
  ) THEN
    ALTER TABLE public.card_profile_links
      ADD CONSTRAINT card_profile_links_provider_token_uniq
      UNIQUE (provider, provider_token);
  END IF;
END $$;

1B. Новый безопасный RPC: backfill_payments_by_card_token (admin-only)
	•	Вход: p_profile_id, p_provider TEXT DEFAULT 'bepaid', p_provider_token TEXT, p_dry_run BOOLEAN, p_limit INT DEFAULT 500.
	•	Находит платежи payments_v2 по provider_payment_id или по provider_response токену (см. PATCH-1C extraction).
	•	Правило обновления:
	•	Обновляем только те платежи, где profile_id IS NULL.
	•	Никогда не перезаписываем существующий profile_id (кроме отдельного p_force=false — не делать в этом спринте).
	•	STOP-guard: p_limit <= 2000.
	•	Audit_logs: только counts + provider_token_hash (sha256), без last4/holder.

ВАЖНО по доступу:
	•	НЕ делать GRANT EXECUTE ... TO authenticated.
	•	Вызывать RPC только через Edge Function/Server (admin gate) или через service_role.

1C. Унифицированный extractor токена (один источник истины)
В одном месте (shared helper) реализовать функцию:
	•	extractProviderToken(provider_response: any): string | null
	•	Путь: $.**.token (jsonpath) + fallback на явные поля bePaid (если есть).
	•	Не логировать сырые provider_response.

⸻

PATCH-2: Автопривязка при импорте/синке — НЕ затирать profile_id (BLOCKER)

Задача: если у платежа есть provider_token, и в card_profile_links есть соответствие → устанавливать/сохранять profile_id.

2A. sync-payments-with-statement
	•	Перед любым UPDATE/UPSERT:
	•	извлечь provider_token
	•	найти link: select profile_id from card_profile_links where provider='bepaid' and provider_token = ...
	•	если нашли и payments_v2.profile_id IS NULL → заполнить.
	•	если payments_v2.profile_id NOT NULL → не трогать.

2B. admin-import-bepaid-statement-csv
	•	Та же логика при upsert платежей из выписки.

⸻

PATCH-3: Server-side pagination для /admin/payments (BLOCKER)

3A. RPC admin_get_payments_page_v1 (рекомендовано вместо сложного cursor-хука)
	•	Вход:
	•	p_from timestamptz, p_to timestamptz
	•	p_limit int DEFAULT 50 (валидировать 20/50/100)
	•	p_offset int DEFAULT 0 (пока offset ok; cursor можно позже)
	•	фильтры: p_status text, p_search text, p_provider text, etc.
	•	Выход: rows + total_count.
	•	Важно: фильтры полностью на сервере.
	•	STOP-guard: p_limit <= 200, p_offset <= 50000.

3B. UI: PaymentsTabContent
	•	Убрать fetchAllPages().
	•	Запрашивать страницу через RPC.
	•	Показать “Показано N из total_count” и кнопки пагинации/Load more.
	•	Page size selector 20/50/100 влияет на server query.

⸻

PATCH-4: Server-side stats/totals (независимо от страницы)

4A. RPC admin_get_payments_stats_v1
	•	Вход: те же фильтры/период, что и page.
	•	Выход: totals (успешные/ошибки/отмены/возвраты/комиссия/выручка и т.п.)
	•	UI stats не должен считать из массива текущей страницы.

4B. UI
	•	PaymentsStatsPanel получает serverStats, а не filteredPayments.
	•	(Опционально) показать “фильтр активен” и total_count.

⸻

PATCH-5: Sync dialog — retry не сломан + батчи + partial success (Medium)
	•	Вынести failedBatches в отдельный useState([]) (не в progress).
	•	progress можно сбрасывать, failedBatches — нет.
	•	Кнопка “Повторить ошибки” запускает apply только по failed batches.
	•	STOP-guard: BATCH_SIZE=100, MAX_UIDS_PER_CALL=500.

⸻

PATCH-6: explain_mismatch включает invalid + duplicates (Low)

6A. Edge Function admin-import-bepaid-statement-csv
	•	В explain_mismatch включить:
	•	invalid rows (row/file/reason)
	•	duplicates merged (uid + “duplicate_merged (n)” + source)
	•	Лимит 20 строк.

6B. UI BepaidStatementImportDialog
	•	Блок “Причины расхождения” со списком.

⸻

PATCH-7: RBAC/безопасность/логирование (обязательный guard-патч)
	•	Все admin RPC/Edge функции проверяют роль (admin_edit).
	•	Никаких массовых функций, доступных authenticated.
	•	Логи и audit_logs без PII.
	•	Добавить в audit_logs actor_type=‘system’ и actor_label (SYSTEM ACTOR Proof).

⸻

Порядок выполнения (фиксированный)
	1.	PATCH-7 (RBAC guard-рамка)
	2.	PATCH-1A → 1B → 1C
	3.	PATCH-2 (сохранение profile_id по token в sync/import)
	4.	PATCH-3 (pagination RPC + UI)
	5.	PATCH-4 (server stats RPC + UI)
	6.	PATCH-5 (retry/failedBatches)
	7.	PATCH-6 (explain duplicates)

⸻

DoD (пруфы, без теории)

DoD-1: Token-линковка работает

SQL:

SELECT COUNT(*) 
FROM card_profile_links 
WHERE provider='bepaid' AND provider_token IS NOT NULL;
-- > 0

SELECT COUNT(*) 
FROM payments_v2 p
JOIN card_profile_links l
  ON l.provider='bepaid' AND l.provider_token = (p.provider_response->>'token') -- или через extractor поле
WHERE p.profile_id IS NULL;
-- стремится к 0 после backfill (в пределах охвата данных)

UI: скрин платежей по одной карте — все исторические транзакции имеют контакт.

DoD-2: Pagination реально server-side

Network/лог: запросы уходят с limit/offset, нет fetchAllPages.
UI: “Показано 50 из 800”, load more грузит следующие.

DoD-3: Stats независимы от страницы

UI totals не меняются при переключении страниц.

DoD-4: Retry работает

Partial → “Повторить ошибки” активна и повторяет только failed batches.

DoD-5: Explain mismatch

Импорт 800→798 показывает:
	•	invalid row (row/file/reason)
	•	duplicate_merged (uid…)

DoD-6: SYSTEM ACTOR Proof

audit_logs содержит запись с actor_type='system', actor_user_id IS NULL, actor_label заполнен.

⸻

Файлы/модули для изменения
	•	supabase/migrations/*.sql (PATCH-1A, 1B, 3A, 4A, guards)
	•	supabase/functions/sync-payments-with-statement/index.ts (PATCH-2,5)
	•	supabase/functions/admin-import-bepaid-statement-csv/index.ts (PATCH-2,6)
	•	src/components/admin/payments/PaymentsTabContent.tsx (PATCH-3,4)
	•	src/components/admin/payments/PaymentsStatsPanel.tsx (PATCH-4)
	•	src/components/admin/payments/SyncWithStatementDialog.tsx (PATCH-5)
	•	src/components/admin/payments/BepaidStatementImportDialog.tsx (PATCH-6)

⸻

Важно: что НЕ делать
	•	Не использовать last4/brand для массового backfill.
	•	Не делать GRANT EXECUTE массовых RPC на authenticated.
	•	Не считать totals из массивов UI при пагинации.
	•	Не оставлять fetchAllPages на /admin/payments.


