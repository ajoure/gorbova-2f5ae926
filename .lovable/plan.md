
# Исправление: super_admin не имеет тех же RLS-прав что admin

## Проблема

На скриншоте ошибка: `new row violates row-level security policy for table "telegram_access_queue"`. Причина — super_admin пытается вставить запись, но таблица имеет только политику для `service_role`.

Полный аудит выявил **10 проблемных мест**:

### 1. Таблица без админ-политики вообще
| Таблица | Текущие политики | Проблема |
|---|---|---|
| `telegram_access_queue` | Только `service_role` | Ни admin, ни super_admin не могут INSERT |

### 2. INSERT-политики с `admin` но БЕЗ `superadmin` (9 штук)
| Таблица | Политика |
|---|---|
| `ai_prompt_packages` | Admins can create prompt packages |
| `bepaid_statement_rows` | Admins can insert bepaid_statement_rows |
| `document_templates` | Admins can create document templates |
| `email_inbox` | Admins can insert emails |
| `email_logs` | Admins can insert email logs |
| `email_threads` | Admins can insert email threads |
| `payments_sync_runs` | Admin insert payments_sync_runs |
| `product_document_templates` | Admins can create product document templates |
| `telegram_messages` | Admins can insert telegram messages |

Все эти политики проверяют `has_role(auth.uid(), 'admin'::app_role)` — bridge-функция маппит `'admin'` в `'admin'`, а super_admin имеет код `'super_admin'`, поэтому проверка не проходит.

### Что НЕ сломано
- Permissions (таблица `role_permissions`) — super_admin имеет ВСЕ права admin + `admins.manage`
- SELECT/UPDATE/DELETE политики на большинстве таблиц уже содержат `OR superadmin`
- Только INSERT-политики пропущены

## Решение

Одна SQL-миграция, которая:

1. **telegram_access_queue** — добавить INSERT+SELECT+UPDATE политику для admin и super_admin
2. **9 таблиц** — пересоздать INSERT-политики с добавлением `OR has_role(auth.uid(), 'superadmin'::app_role)`

## Технические детали (SQL-миграция)

```sql
-- 1. telegram_access_queue: добавить политики для admin/super_admin
CREATE POLICY "Admins can manage telegram_access_queue"
ON public.telegram_access_queue
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- 2-10. Пересоздать 9 INSERT-политик с superadmin
-- Для каждой: DROP старую → CREATE новую с OR superadmin
-- Пример (bepaid_statement_rows):
DROP POLICY "Admins can insert bepaid_statement_rows" ON public.bepaid_statement_rows;
CREATE POLICY "Admins can insert bepaid_statement_rows"
ON public.bepaid_statement_rows FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);
-- Аналогично для остальных 8 таблиц
```

## Что НЕ меняется
- Никакие файлы кода не редактируются
- SELECT/UPDATE/DELETE политики не трогаются (они уже корректны)
- Логика приложения не меняется
- Permissions в role_permissions не меняются

## Результат
- super_admin сможет создавать сделки из платежей (telegram_access_queue INSERT)
- super_admin сможет выполнять все INSERT-операции наравне с admin
- Повторной проблемы с отсутствием прав не будет
