

# Исправление RLS-политики INSERT для таблицы `audit_logs`

## Проблема

При нажатии "Создать сделку" в диалоге "Создать сделку из платежа" возникает ошибка:

> `new row violates row-level security policy for table "audit_logs"`

Текущая INSERT-политика требует одновременно:
1. `actor_user_id = auth.uid()` — строгое совпадение
2. `has_permission(auth.uid(), 'audit.view')` — наличие разрешения

Это ломается в двух случаях:
- Когда `actor_user_id` равен `null` (паттерн "system actor" — используется в нескольких местах проекта)
- Когда `currentUser?.id` оказывается `undefined` (optional chaining)

## Решение

Обновить INSERT-политику, убрав жёсткую привязку `actor_user_id = auth.uid()`. Достаточно проверки, что текущий пользователь — админ с правом `audit.view`.

### Миграция (SQL)

```sql
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

CREATE POLICY "Service role and admins can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (
    ((auth.jwt() ->> 'role') = 'service_role')
    OR has_permission(auth.uid(), 'audit.view'::text)
  );
```

Это безопасно, потому что:
- `audit.view` назначена только ролям `admin` и `super_admin`
- Обычные пользователи по-прежнему не смогут писать в audit_logs
- Паттерн "system actor" (`actor_user_id: null`) начнёт работать корректно

## Затронутые файлы

| Объект | Действие |
|---|---|
| RLS-политика `audit_logs` (INSERT) | Обновить — убрать проверку `actor_user_id = auth.uid()` |

## Что НЕ трогаем

- Все остальные политики `audit_logs` (SELECT, DELETE) — без изменений
- Код `CreateDealFromPaymentDialog.tsx` — без изменений
- Все остальные файлы — без изменений

