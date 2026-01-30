
# План: Добавить автоматическую синхронизацию GetCourse при успешном автосписании

## Цель
При успешном автосписании (`subscription-charge`) автоматически отправлять renewal-заказы (REN-*) в GetCourse, чтобы каждый биллинговый цикл отображался как отдельная сделка.

## Текущее состояние

### Что уже есть:
- `subscription-charge` создаёт renewal order (REN-*) при успешном списании (строки 1098-1271)
- GetCourse sync работает **только** для trial conversion (строки 1401-1455)
- Функция `getcourse-grant-access` умеет отправлять заказ в GetCourse по `order_id`
- Маппинг тарифов → GetCourse offer_id настроен

### Чего не хватает:
- Обычные renewal (не trial) не отправляются в GetCourse
- 107 REN-заказов не синхронизированы

## Техническое решение

### Один файл: `supabase/functions/subscription-charge/index.ts`

**Место добавления:** После создания renewal order (после строки ~1240) или после блока trial conversion (после строки ~1455).

### Логика:

```text
ЕСЛИ renewalOrderId существует (renewal order создан успешно)
  И getcourse_offer_id настроен для тарифа
  И есть customer_email
ТО
  Вызвать getcourse-grant-access с order_id = renewalOrderId
  Залогировать результат в audit_logs
```

### Код изменения:

```typescript
// После строки ~1455, после блока trial conversion и перед telegram-grant-access

// === PATCH: Sync renewal order to GetCourse (for non-trial renewals) ===
if (renewalOrderId && !is_trial) {
  // Get GetCourse offer ID from tariff (or subscription meta)
  const gcOfferId = tariff?.getcourse_offer_id || subMeta?.gc_offer_id;
  const customerEmail = orderData?.customer_email;
  
  if (gcOfferId && customerEmail) {
    console.log(`[GC-SYNC] Sending renewal order ${renewalOrderId} to GetCourse, offer=${gcOfferId}`);
    
    try {
      const gcResult = await supabase.functions.invoke('getcourse-grant-access', {
        body: { order_id: renewalOrderId }
      });
      
      if (gcResult.error) {
        console.error('[GC-SYNC] GetCourse sync failed:', gcResult.error);
        await supabase.from('audit_logs').insert({
          action: 'subscription.gc_sync_renewal_failed',
          actor_type: 'system',
          actor_user_id: null,
          actor_label: 'subscription-charge',
          target_user_id: user_id,
          meta: {
            subscription_id: id,
            renewal_order_id: renewalOrderId,
            gc_offer_id: gcOfferId,
            error: gcResult.error.message || 'Unknown error',
          }
        });
      } else {
        console.log('[GC-SYNC] Renewal synced to GetCourse:', gcResult.data);
        await supabase.from('audit_logs').insert({
          action: 'subscription.gc_sync_renewal_success',
          actor_type: 'system',
          actor_user_id: null,
          actor_label: 'subscription-charge',
          target_user_id: user_id,
          meta: {
            subscription_id: id,
            renewal_order_id: renewalOrderId,
            gc_offer_id: gcOfferId,
            gc_result: gcResult.data,
          }
        });
      }
    } catch (gcErr) {
      console.error('[GC-SYNC] GetCourse invocation error:', gcErr);
    }
  } else {
    console.log(`[GC-SYNC] Skipping renewal sync: gcOfferId=${gcOfferId}, email=${!!customerEmail}`);
  }
}
// === END PATCH: GC Sync ===
```

## Последовательность изменений

| # | Действие | Файл |
|---|----------|------|
| 1 | Добавить вызов `getcourse-grant-access` для renewal orders | `subscription-charge/index.ts` |
| 2 | Логировать успех/ошибку в `audit_logs` | (в том же файле) |

## Что НЕ меняем
- `getcourse-grant-access` — уже готов, принимает `order_id`
- Маппинг тарифов — уже настроен
- Trial conversion — уже работает, не трогаем
- Telegram/email уведомления — не затрагиваем

## Проверка (DoD)

### DoD-1: Логи успешного sync
```sql
SELECT * FROM audit_logs 
WHERE action = 'subscription.gc_sync_renewal_success'
ORDER BY created_at DESC LIMIT 5;
```

### DoD-2: Следующее автосписание создаёт сделку в GetCourse
После ближайшего charge-cron проверить:
- Renewal order создан
- `meta.gc_sync_status = 'success'` в orders_v2
- Сделка появилась в GetCourse

### DoD-3: Нет регрессий
- Trial conversion продолжает работать
- Email/Telegram уведомления отправляются

## Риски

| Риск | Митигация |
|------|-----------|
| GetCourse rate limit | Вызов асинхронный, не блокирует charge flow |
| Дублирование сделок | `getcourse-grant-access` идемпотентен (проверяет `gc_sync_status`) |
| Нет gc_offer_id у тарифа | Skip + log в консоль |

## Опционально: массовый backfill существующих REN-заказов
После применения патча можно запустить backfill для 107 несинхронизированных заказов через админ-панель или отдельный скрипт.
