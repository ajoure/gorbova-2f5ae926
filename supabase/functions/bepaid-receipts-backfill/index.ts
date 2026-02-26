/**
 * F5.1 + F5.FIX + F5.FIX.1 — One-shot backfill for receipt_url on old payments
 * Fill-only: never overwrites existing receipt_url
 * 
 * F5.FIX.1 changes:
 * - Uses RPC receipt_backfill_candidates for server-side filtering (attempts<3 + seek pagination)
 * - Cursor init: 1970-01-01 (not cutoff) to avoid empty first batch
 * - Fresh meta read before fail-update (race condition protection)
 * - candidates_total_raw (renamed, does NOT exclude attempts>=3)
 * - next_cursor only when has_more=true
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBepaidCredsStrict, isBepaidCredsError } from '../_shared/bepaid-credentials.ts';
import { fetchReceiptUrl } from '../_shared/bepaid-receipt-fetch.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BackfillRequest {
  mode: 'dry_run' | 'execute';
  batch_limit?: number;       // 20-300, default 100
  max_batches?: number;       // default 10
  only_origin?: string;       // default 'bepaid'
  created_before_days?: number; // default 2
  cursor_created_at?: string;  // seek pagination cursor
  cursor_id?: string;          // seek pagination cursor
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Auth check — admin only
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAnon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseAnon.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: isAdmin } = await supabase.rpc('has_any_role', {
    _user_id: user.id, _role_codes: ['admin', 'super_admin'],
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: BackfillRequest = await req.json();
    const mode = body.mode || 'dry_run';
    const batchLimit = Math.min(Math.max(body.batch_limit || 100, 20), 300);
    const maxBatches = Math.min(body.max_batches || 10, 50);
    const origin = body.only_origin || 'bepaid';
    const createdBeforeDays = body.created_before_days ?? 2;

    const cutoff = new Date(Date.now() - createdBeforeDays * 24 * 60 * 60 * 1000).toISOString();

    // Raw count — does NOT exclude attempts>=3
    const { count: candidatesTotalRaw, error: countErr } = await supabase
      .from('payments_v2')
      .select('id', { count: 'exact', head: true })
      .eq('origin', origin)
      .eq('status', 'succeeded')
      .not('provider_payment_id', 'is', null)
      .is('receipt_url', null)
      .lt('created_at', cutoff);

    if (countErr) {
      return new Response(JSON.stringify({ error: countErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STOP-guard
    if ((candidatesTotalRaw || 0) > 50000) {
      return new Response(JSON.stringify({
        error: 'STOP: candidates > 50000',
        candidates_total_raw: candidatesTotalRaw,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dry run — use RPC for accurate sample (with attempts<3 filter)
    if (mode === 'dry_run') {
      const { data: samples } = await supabase.rpc('receipt_backfill_candidates', {
        p_origin: origin,
        p_cutoff: cutoff,
        p_cursor_created_at: '1970-01-01T00:00:00.000Z',
        p_cursor_id: '00000000-0000-0000-0000-000000000000',
        p_limit: 10,
      });

      return new Response(JSON.stringify({
        mode: 'dry_run',
        candidates_total_raw: candidatesTotalRaw,
        sample_payment_ids: (samples || []).map((s: any) => s.id),
        samples: samples || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Execute mode — get bePaid credentials
    const credsResult = await getBepaidCredsStrict(supabase);
    if (isBepaidCredsError(credsResult)) {
      return new Response(JSON.stringify({ error: credsResult.error }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metrics = {
      processed: 0,
      filled: 0,
      skipped_already_has: 0,
      failed: 0,
      endpoint_stats: {} as Record<string, number>,
    };
    const sampleFilled: string[] = [];

    // Seek pagination cursor — start from epoch if not provided
    let cursorCreatedAt = body.cursor_created_at || '1970-01-01T00:00:00.000Z';
    let cursorId = body.cursor_id || '00000000-0000-0000-0000-000000000000';
    let hasMore = false;

    for (let batch = 0; batch < maxBatches; batch++) {
      // Use RPC with server-side seek pagination + attempts<3 filter
      const { data: payments, error: fetchErr } = await supabase.rpc('receipt_backfill_candidates', {
        p_origin: origin,
        p_cutoff: cutoff,
        p_cursor_created_at: cursorCreatedAt,
        p_cursor_id: cursorId,
        p_limit: batchLimit,
      });

      if (fetchErr) {
        console.error('[bepaid-receipts-backfill] Batch fetch error:', fetchErr.message);
        break;
      }
      if (!payments || payments.length === 0) break;

      // Update cursor to last row in this batch
      const lastRow = payments[payments.length - 1];
      cursorCreatedAt = lastRow.created_at;
      cursorId = lastRow.id;

      // If we got a full batch, there might be more
      hasMore = payments.length === batchLimit;

      for (const p of payments) {
        metrics.processed++;

        // Fill-only guard (RPC already filters receipt_url IS NULL, but double-check)
        if (p.receipt_url) {
          metrics.skipped_already_has++;
          continue;
        }

        const result = await fetchReceiptUrl(p.provider_payment_id, credsResult);

        if (!result.ok || !result.receipt_url) {
          // Fresh meta read before update (race condition protection)
          const { data: fresh } = await supabase
            .from('payments_v2')
            .select('meta')
            .eq('id', p.id)
            .single();
          const freshMeta = (fresh?.meta as Record<string, any>) || {};
          const mergedMeta = {
            ...freshMeta,
            receipt_backfill_attempts: (freshMeta.receipt_backfill_attempts || 0) + 1,
            receipt_backfill_failed_at: new Date().toISOString(),
          };
          await supabase
            .from('payments_v2')
            .update({ meta: mergedMeta })
            .eq('id', p.id);

          metrics.failed++;
          continue;
        }

        const { error: updateErr } = await supabase
          .from('payments_v2')
          .update({ receipt_url: result.receipt_url })
          .eq('id', p.id)
          .is('receipt_url', null); // fill-only guard in SQL

        if (updateErr) {
          metrics.failed++;
        } else {
          metrics.filled++;
          if (sampleFilled.length < 10) sampleFilled.push(p.id);
          if (result.endpoint_used) {
            metrics.endpoint_stats[result.endpoint_used] = (metrics.endpoint_stats[result.endpoint_used] || 0) + 1;
          }
        }

        // Rate limit: 200ms between requests
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Build next_cursor only if has_more=true
    const nextCursor = hasMore ? { created_at: cursorCreatedAt, id: cursorId } : null;

    // Audit log
    await supabase.from('audit_logs').insert({
      action: 'backfill.receipts',
      actor_type: 'system',
      actor_user_id: null,
      actor_label: 'F5_receipts_backfill',
      meta: {
        candidates_total_raw: candidatesTotalRaw,
        ...metrics,
        sample_filled_ids: sampleFilled,
        triggered_by: user.id,
        cursor_used: { created_at: body.cursor_created_at || null, id: body.cursor_id || null },
        next_cursor: nextCursor,
      },
    });

    console.log(`[bepaid-receipts-backfill] Done: processed=${metrics.processed}, filled=${metrics.filled}, failed=${metrics.failed}`);

    return new Response(JSON.stringify({
      success: true,
      candidates_total_raw: candidatesTotalRaw,
      ...metrics,
      sample_filled_ids: sampleFilled,
      next_cursor: nextCursor,
      has_more: hasMore,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[bepaid-receipts-backfill] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
