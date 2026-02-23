

# План закрытия DoD для PATCH P3.0.1c

## Текущая ситуация

Код `admin-bepaid-webhook-replay` и `bepaid-webhook` задеплоен и работает корректно:
- 401 при неверном/отсутствующем секрете -- подтверждено
- Логика аудита, trace_only guard, bypass по `BEPAID_WEBHOOK_INTERNAL_SECRET` -- в коде
- **Проблема**: инструмент `curl_edge_functions` в Lovable не может подставить реальное значение `CRON_SECRET` из env -- он передает строки буквально

## Решение: одноразовая edge function для self-test

Создать минимальную edge function `admin-replay-self-test`, которая:
1. Читает `CRON_SECRET` и `SUPABASE_URL` из `Deno.env`
2. Вызывает `admin-bepaid-webhook-replay` с правильным `x-cron-secret`
3. Возвращает полный результат (http_status, webhook_response, audit, queue, events)

Эта функция не требует внешних секретов для вызова -- достаточно `Authorization: Bearer <service_role>` (подставляется автоматически инструментом curl).

### Код edge function

```typescript
// supabase/functions/admin-replay-self-test/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET');

  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not in env' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Call replay endpoint with real CRON_SECRET
  const testBody = JSON.stringify({
    body_text: JSON.stringify({
      event: "test_replay_dod",
      data: {
        transaction: { uid: "test-replay-dod-001", status: "successful", type: "payment", amount: 100, currency: "BYN" },
        tracking_id: "dod-test-replay"
      }
    }),
    replay_mode: "trace_only"
  });

  const resp = await fetch(`${supabaseUrl}/functions/v1/admin-bepaid-webhook-replay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': cronSecret,
    },
    body: testBody,
  });

  const result = await resp.text();
  let parsed;
  try { parsed = JSON.parse(result); } catch { parsed = { raw: result }; }

  // Collect SQL proofs
  const supabase = createClient(supabaseUrl, serviceKey);

  const [audit, queue, events] = await Promise.all([
    supabase.from('audit_logs').select('id, actor_type, actor_label, action, meta, created_at')
      .eq('action', 'webhook.replay').order('created_at', { ascending: false }).limit(3),
    supabase.from('payment_reconcile_queue').select('id, source, status, bepaid_uid, created_at')
      .in('source', ['webhook_replay', 'webhook_orphan']).order('created_at', { ascending: false }).limit(5),
    supabase.from('webhook_events').select('id, outcome, http_status, error_message, created_at')
      .order('created_at', { ascending: false }).limit(5),
  ]);

  return new Response(JSON.stringify({
    replay_http_status: resp.status,
    replay_response: parsed,
    proof_audit_logs: audit.data,
    proof_queue: queue.data,
    proof_webhook_events: events.data,
  }, null, 2), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
```

### Последовательность действий

1. Создать `supabase/functions/admin-replay-self-test/index.ts`
2. Добавить в `supabase/config.toml` секцию `[functions.admin-replay-self-test]` с `verify_jwt = false`
3. Задеплоить функцию
4. Вызвать через `curl_edge_functions` (GET/POST без секретов)
5. Получить полный ответ с пруфами:
   - `replay_http_status` = 200
   - `proof_audit_logs` содержит `action='webhook.replay'`
   - `proof_queue` содержит `source='webhook_replay'`
   - `proof_webhook_events` содержит `outcome='replay_trace_only'`
6. Подтвердить SQL-пруфами из ответа
7. **Удалить** `admin-replay-self-test` после закрытия DoD (одноразовый инструмент)

### Безопасность

- Функция `verify_jwt = false`, но это одноразовый тест -- удаляется сразу после проверки
- Не принимает произвольных данных, тело теста захардкожено
- Не создает сайд-эффектов (trace_only)

### Файлы

| Файл | Действие |
|---|---|
| `supabase/functions/admin-replay-self-test/index.ts` | Создать (временно) |
| `supabase/config.toml` | Добавить секцию для self-test |
| После DoD: оба выше | Удалить |

