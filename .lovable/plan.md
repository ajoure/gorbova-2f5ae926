

# Микро-патч: try/catch вокруг CRITICAL ALERT блока (B2)

## Проблема

Строки 858-878 в `bepaid-webhook/index.ts` — блок "CRITICAL ALERT unrecognized tracking_id" — выполняет два `await` (audit_logs + orphans) БЕЗ try/catch. Если БД/RLS вернёт ошибку, webhook упадёт с 500, bePaid начнёт ретраить, и основная обработка транзакции не выполнится.

## Решение

Обернуть блок строк 858-878 в try/catch. При ошибке — логировать в console.error и продолжить выполнение webhook (best-effort orphan logging).

## Изменение

**Файл**: `supabase/functions/bepaid-webhook/index.ts`, строки 858-879

**Было**:
```
if (rawTrackingId && !parsedOrderId && !rawTrackingId.startsWith('subv2:')) {
  console.error(...);
  await supabase.from('audit_logs').insert({...});
  await supabase.from('provider_webhook_orphans').upsert({...});
}
```

**Станет**:
```
if (rawTrackingId && !parsedOrderId && !rawTrackingId.startsWith('subv2:')) {
  console.error(...);
  try {
    await supabase.from('audit_logs').insert({...});
    await supabase.from('provider_webhook_orphans').upsert({...});
  } catch (orphanErr) {
    console.error('[WEBHOOK] Best-effort orphan/audit write failed:', orphanErr);
  }
}
```

## Деплой

1 edge-функция: `bepaid-webhook`

## Результат

Webhook никогда не падает из-за ошибки записи в orphans/audit — основная обработка транзакции продолжается в любом случае.
