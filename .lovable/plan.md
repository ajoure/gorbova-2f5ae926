# Жёсткие правила исполнения для Lovable.dev (ОБЯЗАТЕЛЬНО)
1) Ничего не ломать и не трогать лишнее. Только по списку ниже.
2) Add-only / минимальный diff. Если нужно — под флагом.
3) Всегда: dry-run → execute. Любые массовые изменения только батчами.
4) STOP-guards обязательны (лимиты UID/строк, таймауты, батчи, retry).
5) No-PII в логах (никаких email/тел/ФИО/полных provider_uid).
6) DoD только по фактам: UI-скрины (из админки 7500084@gmail.com) + логи Edge Function + SQL-пруфы + diff-summary.

---

# PATCH-лист: Полная стабилизация bePaid Payments + восстановление привязки карт

## PATCH-1 (BLOCKER): Восстановить привязку "карта → профиль/контакт" и не терять её
### Симптом
По одному и тому же last4 (например **** 1859) платежи есть, но у части строк контакт пустой / “отвалилась” связка. 

### Требование
Если карта привязана в аккаунте пользователя, привязка должна:
- распространяться на ВСЕ исторические транзакции с этой картой
- переживать повторные импорты/сверки/апдейты payments_v2
- НЕ перетирать вручную подтверждённые связи

### Реализация (обязательные пункты)
A) Определить стабильный ключ карты:
- использовать provider card fingerprint / token / card_id (что реально есть в bePaid данных).
- last4 НЕ использовать как единственный ключ (только для UI).

B) Создать/нормализовать таблицу связей (если уже есть — использовать её):
- `card_profile_links` (provider, card_fingerprint, profile_id, linked_by, linked_at, source)
- unique(provider, card_fingerprint)

C) Бэкфилл при привязке карты в аккаунте (и/или при sync/import):
- Edge/RPC `backfill_payments_by_card_fingerprint(profile_id, provider, card_fingerprint, dry_run, limit, cursor)`
- обновлять `payments_v2.profile_id` (и/или `contact_id` если есть) для всех записей с этим `card_fingerprint`
- guard: НЕ трогать записи, где уже стоит profile_id и он отличается (кроме явного режима override в админке)
- всё батчами + audit_logs (actor_type='system', без PII)

D) Защитить от “отваливания”:
- любые апдейты payments_v2 из сверки/импорта НЕ должны занулять profile_id/contact_id, если связь уже известна по card_profile_links
- после insert/update платежа — попытка attach по `card_fingerprint` (fast path)

### DoD
1) UI: по ****1859 все исторические платежи показывают один и тот же контакт после привязки карты в аккаунте.
2) SQL-пруф: COUNT платежей с пустым profile_id по этому fingerprint = 0.
3) audit_logs: есть запись system backfill (batch) с counts.

---

## PATCH-2: Единый источник истины для счётчиков vs таблица (убрать “800 vs 798”)
### Важно
Счётчики должны считаться из ТОГО ЖЕ набора, что и таблица при активных фильтрах.
Но при пагинации “в таблице 50 строк” счётчики должны показывать total по фильтру, а не по текущей странице.

### Реализация
- Вынести агрегации в серверный запрос (preferred): `get_payments_stats(filters)` возвращает totals по фильтру.
- Таблица получает paginated rows, отдельно `total_count`.
- UI показывает “показано X из total_count”, а счётчики = totals по фильтру.

### DoD
С включёнными фильтрами totals и таблица согласованы (total_count и суммы совпадают по одному и тому же фильтру).

---

## PATCH-3: Sync with Statement — батчи, прогресс, частичный успех вместо “Failed to send…”
### Реализация
- UI batching (например 100 UID) + прогресс + “повторить только ошибки”
- STOP-guard на Edge: запрет > MAX_UIDS_PER_CALL с понятной ошибкой “use batching”
- Ответ Edge: batch_id, applied_count, failed_count (и error codes агрегировано, без PII)
- При частичном успехе UI показывает “частично выполнено” (а не красную “ничего не вышло”)

### DoD
Apply selected 800 не падает: либо проходит полностью, либо частично с отчётом и кнопкой retry.

---

## PATCH-4: Единая TZ-нормализация Europe/Minsk везде (filters, sync, stats)
### Реализация
- В UI: now/date ranges рассчитывать в Europe/Minsk
- На Edge/SQL: paid_at фильтровать ISO с +03:00 (или явная TZ функция), одинаково для сверки/таблицы/статов

### DoD
Один и тот же период даёт одинаковые totals везде (без “прыжков” на границе суток/месяца).

---

## PATCH-5: /admin/payments — настоящая server-side pagination + лимиты 20/50/100
### Важно
`slice()` после загрузки “всего за период” — не решение. Нужно:
- limit + cursor/offset на сервере
- total_count отдельно
- быстрый first paint

### DoD
Большие периоды открываются быстро, переключатель 20/50/100 реально уменьшает серверную выборку.

---

## PATCH-6: Explain mismatch (почему 800 → 798) прямо в UI
### Реализация
- import/sync dry-run возвращает `explain_mismatch[]` (до 20), причина: duplicate_merged / missing_uid / parse_error / filtered_by_date / etc.
- UI показывает этот список

### DoD
При mismatch видно “какие UID и почему”, без догадок.

---

# Обязательные SQL-пруфы (приложить в отчёте)
1) Найти платежи по card_fingerprint и проверить, что profile_id заполнен:
- count_total, count_profile_null, count_profile_distinct
2) Stats totals по фильтру == total_count таблицы (один и тот же период/TZ).

