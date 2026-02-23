// admin-bepaid-webhook-replay: Admin/cron-only endpoint to replay a webhook body
// through the bepaid-webhook handler for DoD verification.
// P3.0.1c: Secrets-only auth (no JWT), correct replay headers, audit_logs.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ===== AUTH: strictly secrets only (no JWT) =====
    const adminSecret = req.headers.get('x-admin-secret');
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedAdminSecret = Deno.env.get('ADMIN_SECRET');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');

    let authorizedVia: string | null = null;

    if (adminSecret && expectedAdminSecret && adminSecret === expectedAdminSecret) {
      authorizedVia = 'admin_secret';
    } else if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      authorizedVia = 'cron_secret';
    }

    // If NEITHER secret exists in env → always 401 (no accidental open access)
    if (!expectedAdminSecret && !expectedCronSecret) {
      return new Response(JSON.stringify({ error: 'No auth secrets configured in env' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!authorizedVia) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== Parse request =====
    const { body_text, replay_mode } = await req.json();

    if (!body_text || typeof body_text !== 'string') {
      return new Response(JSON.stringify({ error: 'body_text (string) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const replayMode = (replay_mode === 'full') ? 'full' : 'trace_only';
    const bodyHash = await computeHash(body_text);

    // ===== Audit log BEFORE calling webhook =====
    const requestIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null;

    const { data: auditRow } = await supabase.from('audit_logs').insert({
      actor_type: 'system',
      actor_user_id: null,
      actor_label: 'replay',
      action: 'webhook.replay',
      meta: {
        body_hash: bodyHash,
        body_size: body_text.length,
        replay_mode: replayMode,
        authorized_via: authorizedVia,
        request_ip: requestIp,
        trace_only_forced: replayMode === 'trace_only' && replay_mode === 'full',
        target: `${supabaseUrl}/functions/v1/bepaid-webhook`,
      },
    }).select('id').maybeSingle();

    const auditLogId = auditRow?.id || null;

    // ===== Call bepaid-webhook with correct replay headers =====
    const internalSecret = Deno.env.get('BEPAID_WEBHOOK_INTERNAL_SECRET');

    if (!internalSecret) {
      return new Response(JSON.stringify({
        error: 'BEPAID_WEBHOOK_INTERNAL_SECRET not configured — replay bypass impossible',
        audit_log_id: auditLogId,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[REPLAY] Sending body to bepaid-webhook, size=${body_text.length}, mode=${replayMode}, via=${authorizedVia}`);

    const webhookUrl = `${supabaseUrl}/functions/v1/bepaid-webhook`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'X-Internal-Key': internalSecret,
        'X-Replay': '1',
        'X-Replay-Mode': replayMode,
      },
      body: body_text,
    });

    const responseText = await response.text();
    let responseJson: unknown = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    console.log('[REPLAY] Response:', response.status, responseJson);

    // ===== Collect proof data =====
    const { data: queueRows } = await supabase
      .from('payment_reconcile_queue')
      .select('id, source, bepaid_uid, status, created_at')
      .in('source', ['webhook_replay', 'webhook_orphan', 'webhook'])
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: webhookEvents } = await supabase
      .from('webhook_events')
      .select('id, outcome, http_status, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    return new Response(JSON.stringify({
      ok: response.ok,
      http_status: response.status,
      webhook_response: responseJson,
      body_hash: bodyHash,
      replay_mode: replayMode,
      authorized_via: authorizedVia,
      audit_log_id: auditLogId,
      recent_queue_rows: queueRows,
      recent_webhook_events: webhookEvents,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[REPLAY] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function computeHash(text: string): Promise<string | null> {
  try {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
