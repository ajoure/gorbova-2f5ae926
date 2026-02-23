// admin-bepaid-webhook-replay: Admin-only endpoint to replay a webhook body
// through the bepaid-webhook handler for DoD verification.
// Protected by X-Admin-Secret or admin JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
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
    const adminSecret = req.headers.get('x-admin-secret');
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('ADMIN_SECRET') || Deno.env.get('X_ADMIN_SECRET');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');

    let isAuthorized = false;

    if (adminSecret && expectedSecret && adminSecret === expectedSecret) {
      isAuthorized = true;
    } else if (cronSecret && expectedCronSecret && cronSecret === expectedCronSecret) {
      isAuthorized = true;
    } else {
      // Try JWT auth
      const authHeader = req.headers.get('authorization');
      if (authHeader) {
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseServiceKey;
        const anonClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await anonClient.auth.getUser();
        if (user) {
          const { data: hasRole } = await supabase.rpc('has_any_role', {
            _user_id: user.id,
            _role_codes: ['admin', 'super_admin'],
          });
          isAuthorized = !!hasRole;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { body_text, source_webhook_event_id } = await req.json();

    let replayBody = body_text;

    // Option B: replay from an existing webhook_events row
    if (!replayBody && source_webhook_event_id) {
      // webhook_events doesn't store raw body, so this is informational only
      return new Response(JSON.stringify({
        error: 'webhook_events does not store raw body. Provide body_text directly.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!replayBody) {
      return new Response(JSON.stringify({ error: 'body_text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call bepaid-webhook with the provided body
    console.log('[REPLAY] Sending body to bepaid-webhook, size:', replayBody.length);

    const webhookUrl = `${supabaseUrl}/functions/v1/bepaid-webhook`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // P3.0.1a: Internal bypass for signature verification
        'X-Internal-Key': supabaseServiceKey,
      },
      body: replayBody,
    });

    const responseText = await response.text();
    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    console.log('[REPLAY] Response:', response.status, responseJson);

    // Check queue for proof
    const bodyHash = await computeHash(replayBody);
    const { data: queueRows } = await supabase
      .from('payment_reconcile_queue')
      .select('id, source, bepaid_uid, status, created_at')
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
