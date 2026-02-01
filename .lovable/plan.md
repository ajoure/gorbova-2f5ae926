
# План: Настройка CRON для nightly-system-health (03:00 London) + уведомления всегда

## Диагноз

| Проблема | Причина |
|----------|---------|
| Тест не запустился 02.02.2026 в 03:00 | CRON job **не существует** в `cron.job` |
| Нет уведомлений | 1) Тест не запускался; 2) TG отправляется только при FAIL |
| 2 зависших runs (status=running) | Прерванные ручные запуски |

## Изменения

### PATCH-1: Создать CRON job для 03:00 UTC

**SQL миграция:**
```sql
SELECT cron.schedule(
  'nightly-system-health',
  '0 3 * * *',  -- 03:00 UTC = 03:00 London (зимой) = 06:00 Minsk
  $$
  SELECT net.http_post(
    url := 'https://hdjgkjceownmmnrqqtuz.supabase.co/functions/v1/nightly-system-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := jsonb_build_object('source', 'cron-hourly')
  );
  $$
);
```

**Примечание:** `0 3 * * *` в pg_cron (timezone=GMT) = 03:00 UTC = 03:00 London зимой. Летом London будет BST (UTC+1), и 03:00 UTC = 04:00 London. Для DST-устойчивости можно использовать hourly cron + guard в функции (уже есть).

**Альтернатива (DST-safe):**
```sql
-- Вызывать каждый час, функция сама определит, нужно ли работать
SELECT cron.schedule(
  'nightly-system-health-hourly',
  '0 * * * *',  -- Каждый час
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
```

Функция уже содержит guard:
```typescript
// nightly-system-health/index.ts, line 78-87
if (source === 'cron-hourly' && currentHour !== targetHour) {
  return { skipped: true, reason: 'not_target_hour' };
}
```

### PATCH-2: TG уведомления всегда (PASS/FAIL)

**Файл:** `supabase/functions/nightly-system-health/index.ts`

**Было (строка 163):**
```typescript
if (failedChecks.length > 0 && notifyOwner) {
  // Отправляет TG только при FAIL
}
```

**Станет:**
```typescript
if (notifyOwner) {
  const isSuccess = failedChecks.length === 0;
  const emoji = isSuccess ? '✅' : '🚨';
  const title = isSuccess 
    ? `NIGHTLY CHECK: ALL ${invariantsResult.summary?.total_checks || 0} PASSED`
    : `NIGHTLY CHECK: ${failedChecks.length}/${invariantsResult.summary?.total_checks || 0} FAILED`;
  
  let alertText = `${emoji} ${title}\n\n`;
  
  if (isSuccess) {
    alertText += `All invariants passed.\n`;
  } else {
    for (const check of failedChecks.slice(0, 5)) {
      alertText += `FAIL: ${check.name}\n`;
      alertText += `  Issues: ${check.count}\n`;
      if (check.samples?.[0]) {
        const sampleStr = JSON.stringify(check.samples[0]);
        alertText += `  Sample: ${sampleStr.slice(0, 80)}${sampleStr.length > 80 ? '...' : ''}\n`;
      }
      alertText += '\n';
    }
    if (failedChecks.length > 5) {
      alertText += `... and ${failedChecks.length - 5} more\n\n`;
    }
  }
  
  alertText += `Run: ${nowStr} ${targetTz}\n`;
  alertText += `Duration: ${Date.now() - startTime}ms\n`;
  alertText += `Run ID: ${runId}`;
  
  // Send TG...
}
```

### PATCH-3: Очистка зависших runs

**SQL (через insert tool):**
```sql
UPDATE system_health_runs
SET status = 'aborted', finished_at = now()
WHERE status = 'running' AND created_at < now() - interval '1 hour';
```

### PATCH-4: Ручной тест-прогон

После применения PATCH-2 вызвать:
```bash
POST /functions/v1/nightly-system-health
Body: {"source": "manual-test", "notify_owner": true}
```

Ожидаемый результат:
- HTTP 200 с summary
- TG сообщение на 7500084@gmail.com
- Запись в audit_logs

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/nightly-system-health/index.ts` | PATCH-2: TG всегда |
| SQL миграция | PATCH-1: CRON job |
| SQL (insert tool) | PATCH-3: Очистка зависших |

## Порядок выполнения

1. PATCH-2 (TG всегда) — изменить Edge Function
2. Deploy Edge Function
3. PATCH-4 — ручной тест, проверить TG пришёл
4. PATCH-3 — очистить зависшие runs
5. PATCH-1 — создать CRON job (DST-safe вариант)
6. Завтра утром — проверить автоматический запуск

## DoD (обязательные пруфы)

### 1. CRON job создан
```sql
SELECT jobid, schedule, command, active 
FROM cron.job 
WHERE command ILIKE '%nightly-system-health%';
```
Ожидание: 1 запись, active=true

### 2. Ручной тест
- HTTP-ответ: `success: true/false`, `summary`
- TG скриншот: сообщение с ✅ или 🚨

### 3. audit_logs
```sql
SELECT created_at, action, meta->'failed' as failed, meta->'passed' as passed
FROM audit_logs
WHERE action = 'nightly.system_health_run'
ORDER BY created_at DESC
LIMIT 5;
```

### 4. Зависшие runs очищены
```sql
SELECT id, status, created_at
FROM system_health_runs
WHERE status = 'running';
```
Ожидание: 0 записей

## Технические детали

### Время и DST

| Сезон | London | UTC | Minsk | CRON (UTC) |
|-------|--------|-----|-------|------------|
| Зима | 03:00 GMT | 03:00 | 06:00 | `0 3 * * *` |
| Лето | 03:00 BST | 02:00 | 05:00 | `0 2 * * *` |

DST-safe решение: CRON каждый час + guard в функции (target_tz=Europe/London, target_hour=3).

### TG получатель

- Email: `7500084@gmail.com`
- Telegram user_id: из `profiles.telegram_user_id`
- Bot token: `PRIMARY_TELEGRAM_BOT_TOKEN` (env secret)
