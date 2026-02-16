import { createClient } from 'npm:@supabase/supabase-js@2';
import { getBepaidCredsStrict, createBepaidAuthHeader, isBepaidCredsError } from '../_shared/bepaid-credentials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BEPAID_HOSTS = ['api.bepaid.by', 'merchant.bepaid.by'];
const LIST_PATHS = ['/subscriptions', '/api/subscriptions', '/v2/subscriptions'];

interface BackfillCandidate {
  subscription_v2_id: string;
  user_id: string;
  product_id: string | null;
  status: string;
  auto_renew: boolean;
  provider_token: string;
  pm_brand: string | null;
  pm_last4: string | null;
  profile_id: string | null;
}

interface BackfillResult {
  dry_run: boolean;
  candidates_total: number;
  candidates_autorenew: number;
  api_subscriptions_scanned: number;
  api_matches_found: number;
  api_truncated: boolean;
  api_total_pages_seen: number;
  would_upsert_real_sbs: number;
  would_upsert_synthetic: number;
  upserted_real_sbs: number;
  upserted_synthetic: number;
  errors: string[];
  duration_ms: number;
}

// Fetch all BePaid subscriptions from API with pagination
async function fetchBepaidSubscriptions(
  authHeader: string,
  maxPages: number,
  sleepMs: number
): Promise<{ items: any[]; totalPages: number; truncated: boolean }> {
  const allItems: any[] = [];
  const seenIds = new Set<string>();
  let totalPages = 0;
  let truncated = false;

  for (const host of BEPAID_HOSTS) {
    for (const basePath of LIST_PATHS) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= maxPages) {
        const url = `https://${host}${basePath}?page=${page}&per_page=50`;
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            hasMore = false;
            continue;
          }

          const data = await response.json();
          const subs = data.subscriptions || data.data || [];

          if (Array.isArray(subs) && subs.length > 0) {
            totalPages++;
            for (const sub of subs) {
              if (sub?.id && !seenIds.has(sub.id)) {
                seenIds.add(sub.id);
                allItems.push(sub);
              }
            }
            if (subs.length < 50) {
              hasMore = false;
            } else {
              page++;
              if (sleepMs > 0) {
                await new Promise(r => setTimeout(r, sleepMs));
              }
            }
          } else {
            hasMore = false;
          }
        } catch {
          hasMore = false;
        }
      }

      if (page > maxPages) {
        truncated = true;
      }

      if (allItems.length > 0) {
        return { items: allItems, totalPages, truncated };
      }
    }
  }

  return { items: allItems, totalPages, truncated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: admin/superadmin only
    const authHeaderVal = req.headers.get('Authorization');
    if (!authHeaderVal) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeaderVal.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: isAdmin }, { data: isSuperAdmin }] = await Promise.all([
      supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
      supabase.rpc('has_role', { _user_id: user.id, _role: 'superadmin' }),
    ]);
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse params
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default true
    const sinceDays = Math.min(Number(body.since_days) || 365, 730);
    const limit = Math.min(Number(body.limit) || 500, 1000);
    const mode = body.mode || 'both'; // api_match | synthetic | both
    const includeNonAutorenew = body.include_non_autorenew === true;
    const maxPages = Math.min(Number(body.max_pages) || 6, 40);
    const apiScanMode = body.api_scan_mode || 'limited'; // limited | deep
    const effectiveMaxPages = apiScanMode === 'deep' ? Math.min(maxPages, 40) : Math.min(maxPages, 6);
    const sleepMs = apiScanMode === 'deep' ? 250 : 0;

    const errors: string[] = [];
    const MAX_ERRORS = 10;

    // Step A: Find candidates
    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    // Get subscriptions_v2 missing provider_subscriptions
    const { data: candidates, error: candError } = await supabase.rpc('get_backfill_candidates', {
      p_since_date: sinceDate,
      p_limit: limit,
      p_include_non_autorenew: includeNonAutorenew,
    });

    // Fallback: manual query if RPC doesn't exist
    let finalCandidates: BackfillCandidate[] = [];

    if (candError) {
      console.log('[backfill] RPC not found, using manual query');
      // Manual query
      const autoRenewFilter = includeNonAutorenew ? {} : { auto_renew: true };
      
      const { data: subs } = await supabase
        .from('subscriptions_v2')
        .select('id, user_id, product_id, status, auto_renew, profile_id')
        .in('status', ['active', 'trial', 'past_due'])
        .match(autoRenewFilter)
        .limit(limit);

      if (!subs || subs.length === 0) {
        return new Response(JSON.stringify({
          dry_run: dryRun, candidates_total: 0, candidates_autorenew: 0,
          api_subscriptions_scanned: 0, api_matches_found: 0, api_truncated: false,
          api_total_pages_seen: 0, would_upsert_real_sbs: 0, would_upsert_synthetic: 0,
          upserted_real_sbs: 0, upserted_synthetic: 0, errors: [],
          duration_ms: Date.now() - startTime,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get payment methods for these users
      const userIds = [...new Set(subs.map(s => s.user_id))];
      const { data: pms } = await supabase
        .from('payment_methods')
        .select('id, user_id, provider_token, brand, last4, status')
        .eq('provider', 'bepaid')
        .eq('status', 'active')
        .in('user_id', userIds);

      const pmByUser = new Map<string, any>();
      for (const pm of pms || []) {
        if (pm.provider_token && (!pmByUser.has(pm.user_id) || pm.provider_token)) {
          pmByUser.set(pm.user_id, pm);
        }
      }

      // Get existing provider_subscriptions to exclude
      const { data: existingPS } = await supabase
        .from('provider_subscriptions')
        .select('subscription_v2_id')
        .eq('provider', 'bepaid')
        .in('subscription_v2_id', subs.map(s => s.id));

      const existingSubIds = new Set((existingPS || []).map(ps => ps.subscription_v2_id));

      for (const s of subs) {
        if (existingSubIds.has(s.id)) continue;
        const pm = pmByUser.get(s.user_id);
        if (!pm?.provider_token) continue;

        finalCandidates.push({
          subscription_v2_id: s.id,
          user_id: s.user_id,
          product_id: s.product_id,
          status: s.status,
          auto_renew: s.auto_renew ?? false,
          provider_token: pm.provider_token,
          pm_brand: pm.brand,
          pm_last4: pm.last4,
          profile_id: s.profile_id || null,
        });
      }
    } else {
      finalCandidates = (candidates || []).map((c: any) => ({
        subscription_v2_id: c.subscription_v2_id || c.id,
        user_id: c.user_id,
        product_id: c.product_id,
        status: c.status,
        auto_renew: c.auto_renew ?? false,
        provider_token: c.provider_token,
        pm_brand: c.pm_brand || c.brand,
        pm_last4: c.pm_last4 || c.last4,
        profile_id: c.profile_id,
      }));
    }

    const candidatesAutorenew = finalCandidates.filter(c => c.auto_renew).length;

    console.log(`[backfill] Found ${finalCandidates.length} candidates (${candidatesAutorenew} auto_renew), mode=${mode}, dry_run=${dryRun}`);

    // Step B: API matching
    let apiSubscriptions: any[] = [];
    let apiTruncated = false;
    let apiTotalPages = 0;
    let apiMatchesFound = 0;
    const matchedCandidateIds = new Set<string>();

    if (mode === 'api_match' || mode === 'both') {
      // Get BePaid credentials
      const creds = await getBepaidCredsStrict(supabase);
      if (isBepaidCredsError(creds)) {
        console.error('[backfill] No BePaid credentials:', creds.error);
        errors.push('BePaid credentials not configured: ' + creds.error);
      } else {
        const bepaidAuth = createBepaidAuthHeader(creds);
        const result = await fetchBepaidSubscriptions(bepaidAuth, effectiveMaxPages, sleepMs);
        apiSubscriptions = result.items;
        apiTruncated = result.truncated;
        apiTotalPages = result.totalPages;

        console.log(`[backfill] API: ${apiSubscriptions.length} subscriptions fetched, ${apiTotalPages} pages, truncated=${apiTruncated}`);

        // Build token -> API subscription map
        const tokenToApiSub = new Map<string, any>();
        for (const apiSub of apiSubscriptions) {
          const cardToken = apiSub.credit_card?.token;
          if (cardToken) {
            tokenToApiSub.set(cardToken, apiSub);
          }
        }

        // Match candidates by token
        for (const cand of finalCandidates) {
          const apiSub = tokenToApiSub.get(cand.provider_token);
          if (!apiSub) continue;

          matchedCandidateIds.add(cand.subscription_v2_id);
          apiMatchesFound++;

          const sbsId = String(apiSub.id);
          const apiState = apiSub.state || apiSub.status || 'active';
          const normalizedState = apiState === 'cancelled' ? 'canceled' : apiState;
          const planAmount = apiSub.plan?.amount;
          const planCurrency = apiSub.plan?.currency || 'BYN';
          const amountCents = planAmount ? (planAmount > 1000 ? planAmount : planAmount * 100) : null;

          if (!dryRun) {
            if (errors.length >= MAX_ERRORS) {
              errors.push('STOP: max errors reached');
              break;
            }

            const { error: upsertErr } = await supabase
              .from('provider_subscriptions')
              .upsert({
                provider: 'bepaid',
                provider_subscription_id: sbsId,
                subscription_v2_id: cand.subscription_v2_id,
                user_id: cand.user_id,
                profile_id: cand.profile_id,
                product_id: cand.product_id,
                state: normalizedState,
                amount_cents: amountCents,
                currency: planCurrency,
                card_brand: apiSub.credit_card?.brand || cand.pm_brand,
                card_last4: apiSub.credit_card?.last_4 || cand.pm_last4,
                card_token: cand.provider_token,
                next_charge_at: apiSub.next_billing_at || null,
                last_charge_at: apiSub.last_transaction?.created_at || null,
                raw_data: apiSub,
                meta: {
                  synthetic: false,
                  lookup_mode: 'api_card_token_match',
                  backfilled_at: new Date().toISOString(),
                  api_scan_mode: apiScanMode,
                  api_truncated: apiTruncated,
                  source_subscription_v2_id: cand.subscription_v2_id,
                },
              }, { onConflict: 'provider,provider_subscription_id' });

            if (upsertErr) {
              errors.push(`API match upsert failed for sbs=${sbsId}: ${upsertErr.message}`);
            }
          }
        }
      }
    }

    // Step C: Synthetic fallback
    let syntheticCount = 0;
    const unmatchedCandidates = finalCandidates.filter(c => !matchedCandidateIds.has(c.subscription_v2_id));

    if ((mode === 'synthetic' || mode === 'both') && unmatchedCandidates.length > 0) {
      // Get latest recurring payments per user+product for amount/date
      const userProductKeys = unmatchedCandidates.map(c => c.user_id);
      const { data: latestPayments } = await supabase
        .from('payments_v2')
        .select('id, user_id, product_id, amount, currency, paid_at, created_at')
        .eq('provider', 'bepaid')
        .eq('status', 'succeeded')
        .eq('is_recurring', true)
        .in('user_id', [...new Set(userProductKeys)])
        .order('created_at', { ascending: false })
        .limit(500);

      // Build user_id -> latest payment map
      const userToLatestPayment = new Map<string, any>();
      for (const p of latestPayments || []) {
        if (!userToLatestPayment.has(p.user_id)) {
          userToLatestPayment.set(p.user_id, p);
        }
      }

      // Process in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < unmatchedCandidates.length; i += BATCH_SIZE) {
        if (errors.length >= MAX_ERRORS) {
          errors.push('STOP: max errors reached during synthetic');
          break;
        }

        const batch = unmatchedCandidates.slice(i, i + BATCH_SIZE);

        for (const cand of batch) {
          syntheticCount++;

          if (!dryRun) {
            const latestPayment = userToLatestPayment.get(cand.user_id);
            const amountCents = latestPayment?.amount ? Math.round(latestPayment.amount * 100) : null;
            const currency = latestPayment?.currency || 'BYN';
            const lastChargeAt = latestPayment?.paid_at || latestPayment?.created_at || null;

            // Map subscription status to provider state
            let providerState = 'active';
            if (cand.status === 'past_due') providerState = 'past_due';
            if (!cand.auto_renew) providerState = 'canceled';

            const { error: upsertErr } = await supabase
              .from('provider_subscriptions')
              .upsert({
                provider: 'bepaid',
                provider_subscription_id: `internal:${cand.subscription_v2_id}`,
                subscription_v2_id: cand.subscription_v2_id,
                user_id: cand.user_id,
                profile_id: cand.profile_id,
                product_id: cand.product_id,
                state: providerState,
                amount_cents: amountCents,
                currency: currency,
                card_brand: cand.pm_brand,
                card_last4: cand.pm_last4,
                card_token: cand.provider_token,
                last_charge_at: lastChargeAt,
                meta: {
                  synthetic: true,
                  source: 'token_direct_charge',
                  lookup_mode: 'backfill_synthetic',
                  backfilled_at: new Date().toISOString(),
                  source_subscription_v2_id: cand.subscription_v2_id,
                  amount_source: amountCents ? 'latest_recurring_payment' : 'missing',
                },
              }, { onConflict: 'provider,provider_subscription_id' });

            if (upsertErr) {
              errors.push(`Synthetic upsert failed for sub=${cand.subscription_v2_id.slice(0, 8)}: ${upsertErr.message}`);
            }
          }
        }
      }
    }

    const result: BackfillResult = {
      dry_run: dryRun,
      candidates_total: finalCandidates.length,
      candidates_autorenew: candidatesAutorenew,
      api_subscriptions_scanned: apiSubscriptions.length,
      api_matches_found: apiMatchesFound,
      api_truncated: apiTruncated,
      api_total_pages_seen: apiTotalPages,
      would_upsert_real_sbs: dryRun ? apiMatchesFound : 0,
      would_upsert_synthetic: dryRun ? syntheticCount : 0,
      upserted_real_sbs: dryRun ? 0 : apiMatchesFound,
      upserted_synthetic: dryRun ? 0 : syntheticCount,
      errors: errors.slice(0, 20),
      duration_ms: Date.now() - startTime,
    };

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_type: 'admin',
      actor_user_id: user.id,
      action: dryRun ? 'admin.bepaid_backfill_dry_run' : 'admin.bepaid_backfill_execute',
      meta: {
        candidates_total: result.candidates_total,
        api_matches: result.api_matches_found,
        synthetic: dryRun ? result.would_upsert_synthetic : result.upserted_synthetic,
        errors_count: errors.length,
        mode,
        api_scan_mode: apiScanMode,
      },
    });

    console.log(`[backfill] Done in ${result.duration_ms}ms: ${JSON.stringify({
      candidates: result.candidates_total,
      api_matches: result.api_matches_found,
      synthetic: dryRun ? result.would_upsert_synthetic : result.upserted_synthetic,
      errors: errors.length,
    })}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[backfill] Fatal error:', e);
    return new Response(JSON.stringify({ error: e.message, duration_ms: Date.now() - startTime }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
