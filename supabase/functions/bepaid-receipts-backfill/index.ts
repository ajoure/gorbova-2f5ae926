/**
 * F5.1 + F5.FIX — One-shot backfill for receipt_url on old payments
 * Fill-only: never overwrites existing receipt_url
 * 
 * F5.FIX changes:
 * - Seek pagination by (created_at, id) — no infinite loop on failed rows
 * - Skip-failed: meta.receipt_backfill_attempts >= 3 excluded
 * - Meta merge: never overwrite existing meta fields
 * - Response includes next_cursor + has_more
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

    // Count total candidates (excluding already-failed >= 3 attempts)
    // We use RPC or raw filter; since meta is JSONB, we filter in-app for count
    const { count: candidatesTotal, error: countErr } = await supabase
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
    if ((candidatesTotal || 0) > 50000) {
      return new Response(JSON.stringify({
        error: 'STOP: candidates > 50000',
        candidates_total: candidatesTotal,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dry run
    if (mode === 'dry_run') {
      const { data: samples } = await supabase
        .from('payments_v2')
        .select('id, provider_payment_id, created_at, amount, meta')
        .eq('origin', origin)
        .eq('status', 'succeeded')
        .not('provider_payment_id', 'is', null)
        .is('receipt_url', null)
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(10);

      // Filter out samples with attempts >= 3
      const filteredSamples = (samples || []).filter(s => {
        const meta = s.meta as Record<string, any> | null;
        return (meta?.receipt_backfill_attempts || 0) < 3;
      });

      return new Response(JSON.stringify({
        mode: 'dry_run',
        candidates_total: candidatesTotal,
        will_process_now: Math.min(candidatesTotal || 0, batchLimit * maxBatches),
        sample_payment_ids: filteredSamples.map(s => s.id),
        samples: filteredSamples,
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
      skipped_max_attempts: 0,
      failed: 0,
      endpoint_stats: {} as Record<string, number>,
    };
    const sampleFilled: string[] = [];

    // Seek pagination cursor
    let cursorCreatedAt = body.cursor_created_at || cutoff;
    let cursorId = body.cursor_id || '';
    let hasMore = false;

    for (let batch = 0; batch < maxBatches; batch++) {
      // Build query with seek pagination: (created_at, id) > (cursor_created_at, cursor_id)
      // Using .or() for composite seek: created_at > cursor OR (created_at = cursor AND id > cursorId)
      let query = supabase
        .from('payments_v2')
        .select('id, provider_payment_id, receipt_url, created_at, meta')
        .eq('origin', origin)
        .eq('status', 'succeeded')
        .not('provider_payment_id', 'is', null)
        .is('receipt_url', null)
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(batchLimit);

      // Apply seek pagination
      if (cursorId) {
        query = query.or(
          `created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorId})`
        );
      } else {
        query = query.gte('created_at', cursorCreatedAt);
      }

      const { data: payments, error: fetchErr } = await query;

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

        // Fill-only guard
        if (p.receipt_url) {
          metrics.skipped_already_has++;
          continue;
        }

        // Skip-failed guard: check meta.receipt_backfill_attempts
        const existingMeta = (p.meta as Record<string, any>) || {};
        const currentAttempts = existingMeta.receipt_backfill_attempts || 0;
        if (currentAttempts >= 3) {
          metrics.skipped_max_attempts++;
          continue;
        }

        const result = await fetchReceiptUrl(p.provider_payment_id, credsResult);

        if (!result.ok || !result.receipt_url) {
          // Mark as failed attempt — meta merge (preserve existing fields)
          const newAttempts = currentAttempts + 1;
          const mergedMeta = {
            ...existingMeta,
            receipt_backfill_attempts: newAttempts,
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

    // Build next_cursor (null if no more data)
    const nextCursor = hasMore ? { created_at: cursorCreatedAt, id: cursorId } : null;

    // Audit log
    await supabase.from('audit_logs').insert({
      action: 'backfill.receipts',
      actor_type: 'system',
      actor_user_id: null,
      actor_label: 'F5_receipts_backfill',
      meta: {
        candidates_total: candidatesTotal,
        ...metrics,
        sample_filled_ids: sampleFilled,
        triggered_by: user.id,
        cursor_used: { created_at: body.cursor_created_at || null, id: body.cursor_id || null },
        next_cursor: nextCursor,
      },
    });

    console.log(`[bepaid-receipts-backfill] Done: processed=${metrics.processed}, filled=${metrics.filled}, failed=${metrics.failed}, skipped_max_attempts=${metrics.skipped_max_attempts}`);

    return new Response(JSON.stringify({
      success: true,
      candidates_total: candidatesTotal,
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
