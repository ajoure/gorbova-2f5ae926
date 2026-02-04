import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PATCH-I+: Hosts matrix for fallback
const BEPAID_HOSTS = ['api.bepaid.by', 'merchant.bepaid.by'];

// PATCH-I++: Paths matrix for list/details
const LIST_PATHS = [
  '/subscriptions',
  '/api/subscriptions',
  '/v2/subscriptions',
];

const DETAIL_PATHS = [
  '/subscriptions',
  '/api/subscriptions',
  '/v2/subscriptions',
];

// PATCH-H/J: Centralized status normalization
function normalizeStatus(status: string | undefined): string {
  if (!status) return 'unknown';
  if (status === 'cancelled') return 'canceled';
  return status;
}

interface BepaidSubscription {
  id: string;
  status: string;
  state?: string;
  plan?: {
    title?: string;
    amount?: number;
    currency?: string;
    interval?: string;
    trial_period?: number;
  };
  created_at?: string;
  next_billing_at?: string;
  credit_card?: {
    last_4?: string;
    brand?: string;
    holder?: string;
  };
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  _details_missing?: boolean;
}

interface SubscriptionWithLink {
  id: string;
  status: string;
  plan_title: string;
  plan_amount: number;
  plan_currency: string;
  customer_email: string;
  customer_name: string;
  card_last4: string;
  card_brand: string;
  created_at: string;
  next_billing_at: string;
  linked_subscription_id: string | null;
  linked_user_id: string | null;
  linked_profile_name: string | null;
  is_orphan: boolean;
  snapshot_state?: string;
  snapshot_at?: string;
  cancellation_capability?: string;
  needs_support?: boolean;
  details_missing?: boolean;
}

interface CredentialsResult {
  shopId: string;
  secretKey: string;
  source: 'integration_instance_only';
  instanceStatus?: string;
}

interface HostAttempt {
  host: string;
  path: string;
  status: number;
  items_count?: number;
  body_preview?: string;
}

interface ProbeResult {
  id: string;
  hosts_tried: HostAttempt[];
  conclusion: 'found_on_host' | 'not_found_on_any_host' | 'auth_error' | 'error';
  found_host?: string;
  provider_state?: string;
}

interface AuthCheckResult {
  host: string;
  path: string;
  status: number;
  ok: boolean;
}

// PATCH-I+: Credentials ONLY from integration_instances (no env fallback)
async function getBepaidCredentialsStrict(supabase: any): Promise<CredentialsResult | null> {
  const { data: instance } = await supabase
    .from('integration_instances')
    .select('config, status')
    .eq('provider', 'bepaid')
    .in('status', ['active', 'connected'])
    .maybeSingle();

  const shopIdFromInstance = instance?.config?.shop_id;
  const secretFromInstance = instance?.config?.secret_key;
  
  if (shopIdFromInstance && secretFromInstance) {
    console.log(`[bepaid-list-subs] Using creds from integration_instances only: shop_id=${shopIdFromInstance}, status=${instance?.status}`);
    return { 
      shopId: String(shopIdFromInstance), 
      secretKey: String(secretFromInstance),
      source: 'integration_instance_only',
      instanceStatus: instance?.status
    };
  }

  // PATCH-I+: NO env fallback - strict mode
  return null;
}

// PATCH-I+.2: Auth self-check endpoint
async function checkAuthValid(authString: string): Promise<AuthCheckResult> {
  // Try a safe endpoint to validate credentials (list with limit 1)
  for (const host of BEPAID_HOSTS) {
    const url = `https://${host}/subscriptions?page=1&per_page=1`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authString}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      
      // 200 or 404 = auth works; 401/403 = auth failed
      const ok = response.status !== 401 && response.status !== 403;
      return { host, path: '/subscriptions', status: response.status, ok };
    } catch (e) {
      console.warn(`[bepaid-list-subs] auth probe to ${host} failed:`, e);
    }
  }
  return { host: 'none', path: '', status: 0, ok: false };
}

// PATCH-I++: Multi-host/path details fetch
async function fetchDetailsMultiPath(id: string, authString: string): Promise<{ data: BepaidSubscription | null; attempts: HostAttempt[] }> {
  const attempts: HostAttempt[] = [];
  
  for (const host of BEPAID_HOSTS) {
    for (const basePath of DETAIL_PATHS) {
      const url = `https://${host}${basePath}/${id}`;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });
        
        let bodyPreview = '';
        if (!response.ok) {
          const text = await response.text();
          bodyPreview = text.slice(0, 100);
        }
        
        attempts.push({ host, path: basePath, status: response.status, body_preview: bodyPreview });
        
        if (response.ok) {
          const data = await response.json();
          const sub = data.subscription || data;
          if (sub?.id) {
            return { data: sub, attempts };
          }
        }
      } catch (e) {
        attempts.push({ host, path: basePath, status: 0, body_preview: String(e).slice(0, 100) });
      }
    }
  }
  
  return { data: null, attempts };
}

// PATCH-I++: Multi-host/path list fetch
async function fetchListMultiPath(authString: string, statusFilter?: string): Promise<{ items: BepaidSubscription[]; attempts: HostAttempt[] }> {
  const attempts: HostAttempt[] = [];
  
  for (const host of BEPAID_HOSTS) {
    for (const basePath of LIST_PATHS) {
      const queryParams = statusFilter 
        ? `?status=${encodeURIComponent(statusFilter)}&page=1&per_page=50`
        : '?page=1&per_page=50';
      const url = `https://${host}${basePath}${queryParams}`;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${authString}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });
        
        attempts.push({ host, path: basePath, status: response.status, items_count: 0 });
        
        if (response.ok) {
          const data = await response.json();
          const subs = data.subscriptions || data.data || [];
          if (Array.isArray(subs) && subs.length > 0) {
            attempts[attempts.length - 1].items_count = subs.length;
            return { items: subs, attempts };
          }
        }
      } catch (e) {
        attempts.push({ host, path: basePath, status: 0, body_preview: String(e).slice(0, 50) });
      }
    }
  }
  
  return { items: [], attempts };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check - only admins
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: hasAdmin }, { data: hasSuperAdmin }] = await Promise.all([
      supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
      supabase.rpc('has_role', { _user_id: user.id, _role: 'superadmin' }),
    ]);

    const isAdmin = hasAdmin === true || hasSuperAdmin === true;
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH-I+: Parse query params for probe modes
    const url = new URL(req.url);
    const probeAuth = url.searchParams.get('probe_auth') === '1';
    const probeId = url.searchParams.get('probe_id');
    const hydrateFromDb = url.searchParams.get('hydrate_from_db') === '1';

    // PATCH-I+: Strict credentials from integration_instances only
    const credentials = await getBepaidCredentialsStrict(supabase);
    if (!credentials) {
      console.error('[bepaid-list-subs] No credentials found in integration_instances');
      return new Response(JSON.stringify({ 
        subscriptions: [], 
        stats: { total: 0, active: 0, trial: 0, canceled: 0, orphans: 0, linked: 0 }, 
        error: 'Учетные данные bePaid не настроены в интеграциях',
        debug: {
          creds_source: 'none',
          missing_fields: !credentials ? ['shop_id', 'secret_key'] : [],
          shop_id_present: false,
          secret_present: false,
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authString = btoa(`${credentials.shopId}:${credentials.secretKey}`);

    // PATCH-I+.2: Auth probe mode
    if (probeAuth) {
      const authCheckResult = await checkAuthValid(authString);
      return new Response(JSON.stringify({
        auth_check: authCheckResult,
        debug: {
          creds_source: credentials.source,
          shop_id_present: true,
          secret_present: true,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH-I++: Probe by specific ID mode
    if (probeId) {
      const { data: subData, attempts } = await fetchDetailsMultiPath(probeId, authString);
      
      const foundAttempt = attempts.find(a => a.status === 200);
      const authErrors = attempts.filter(a => a.status === 401 || a.status === 403);
      
      let conclusion: ProbeResult['conclusion'] = 'not_found_on_any_host';
      if (subData) {
        conclusion = 'found_on_host';
      } else if (authErrors.length > 0 && authErrors.length === attempts.length) {
        conclusion = 'auth_error';
      }
      
      const probeResult: ProbeResult = {
        id: probeId,
        hosts_tried: attempts,
        conclusion,
        found_host: foundAttempt?.host,
        provider_state: subData ? normalizeStatus(subData.state || subData.status) : undefined,
      };
      
      return new Response(JSON.stringify({
        probe_result: probeResult,
        debug: {
          creds_source: credentials.source,
          shop_id_present: true,
          secret_present: true,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get provider_subscriptions for fallback/linking
    const { data: providerSubs } = await supabase
      .from('provider_subscriptions')
      .select('provider_subscription_id, subscription_v2_id, user_id, profile_id, meta, state')
      .eq('provider', 'bepaid');

    const providerSubsMap = new Map<string, any>();
    for (const ps of providerSubs || []) {
      providerSubsMap.set(ps.provider_subscription_id, ps);
    }

    // Get our DB mappings
    const { data: dbSubs } = await supabase
      .from('subscriptions_v2')
      .select('id, user_id, meta, status')
      .not('meta->bepaid_subscription_id', 'is', null);

    const bepaidIdToOurSub = new Map<string, { id: string; user_id: string; status: string }>();
    for (const sub of dbSubs || []) {
      const bepaidId = (sub.meta as any)?.bepaid_subscription_id;
      if (bepaidId) {
        bepaidIdToOurSub.set(String(bepaidId), { id: sub.id, user_id: sub.user_id, status: sub.status });
      }
    }

    const allSubscriptions: BepaidSubscription[] = [];
    const fetchedIds = new Set<string>();
    
    // Debug counters
    let apiListCount = 0;
    let detailsFetched = 0;
    let detailsFailed = 0;
    const listAttempts: HostAttempt[] = [];
    const detailErrorsByStatus: Record<number, number> = {};
    const detailAttemptsSample: HostAttempt[] = [];

    // PATCH-I++: Step 1 - List WITHOUT status filter first
    const { items: noFilterItems, attempts: noFilterAttempts } = await fetchListMultiPath(authString);
    listAttempts.push(...noFilterAttempts);
    
    for (const sub of noFilterItems) {
      if (sub?.id && !fetchedIds.has(sub.id)) {
        fetchedIds.add(sub.id);
        allSubscriptions.push(sub);
        apiListCount++;
      }
    }
    
    // PATCH-I++: Step 2 - List WITH status filters if step 1 empty
    if (allSubscriptions.length === 0) {
      const statuses = ['active', 'trial', 'cancelled', 'past_due', 'pending'];
      for (const status of statuses) {
        const { items, attempts } = await fetchListMultiPath(authString, status);
        listAttempts.push(...attempts);
        
        for (const sub of items) {
          if (sub?.id && !fetchedIds.has(sub.id)) {
            fetchedIds.add(sub.id);
            allSubscriptions.push(sub);
            apiListCount++;
          }
        }
        
        if (allSubscriptions.length > 0) break;
      }
    }

    // PATCH-I+++: Hydrate from DB mode OR fallback when list empty
    if ((hydrateFromDb || allSubscriptions.length === 0) && (providerSubs?.length || 0) > 0) {
      console.log(`[bepaid-list-subs] Hydrating from DB: ${providerSubs?.length} provider_subscriptions records`);
      
      let processed = 0;
      const maxProcess = 20; // STOP-guard for batch limit
      
      for (const ps of providerSubs || []) {
        if (processed >= maxProcess) break;
        
        const psId = ps.provider_subscription_id;
        if (!psId || fetchedIds.has(psId)) continue;
        
        processed++;
        const { data: subData, attempts } = await fetchDetailsMultiPath(psId, authString);
        
        // Sample first 3 for debug
        if (detailAttemptsSample.length < 3 && attempts.length > 0) {
          detailAttemptsSample.push(...attempts.slice(0, 2));
        }
        
        // Track error status counts
        for (const a of attempts) {
          if (a.status !== 200 && a.status !== 0) {
            detailErrorsByStatus[a.status] = (detailErrorsByStatus[a.status] || 0) + 1;
          }
        }
        
        if (subData) {
          detailsFetched++;
          fetchedIds.add(psId);
          allSubscriptions.push({
            id: psId,
            status: subData.state || subData.status || ps.state || 'unknown',
            state: subData.state,
            plan: subData.plan,
            created_at: subData.created_at,
            next_billing_at: subData.next_billing_at,
            credit_card: subData.credit_card,
            customer: subData.customer,
          });
        } else {
          detailsFailed++;
          fetchedIds.add(psId);
          // Create placeholder from DB
          allSubscriptions.push({
            id: psId,
            status: ps.state || 'unknown',
            state: ps.state,
            plan: undefined,
            created_at: undefined,
            next_billing_at: undefined,
            credit_card: undefined,
            customer: undefined,
            _details_missing: true,
          });
        }
      }
      
      console.log(`[bepaid-list-subs] Hydration complete: ${detailsFetched} fetched, ${detailsFailed} failed`);
    }

    // Get profiles for linking
    const userIds = [...new Set([
      ...[...bepaidIdToOurSub.values()].map((s) => s.user_id),
      ...(providerSubs || []).map(ps => ps.user_id).filter(Boolean),
    ])];
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', userIds);

    const userIdToProfile = new Map(profiles?.map((p) => [p.user_id, { name: p.full_name, email: p.email }]) || []);

    // Build result with normalized status
    const result: SubscriptionWithLink[] = allSubscriptions.map((sub) => {
      const ourSub = sub.id ? bepaidIdToOurSub.get(String(sub.id)) : undefined;
      const providerSub = providerSubsMap.get(String(sub.id));
      
      const linkedUserId = ourSub?.user_id || providerSub?.user_id || null;
      const linkedSubId = ourSub?.id || providerSub?.subscription_v2_id || null;
      
      const profile = linkedUserId ? userIdToProfile.get(linkedUserId) : null;

      const planAmountRaw = sub.plan?.amount ?? 0;
      const planAmount = planAmountRaw > 1000 ? planAmountRaw / 100 : planAmountRaw;

      const rawStatus = sub.state || sub.status || 'unknown';
      const normalizedStatus = normalizeStatus(rawStatus);

      const providerMeta = providerSub?.meta as Record<string, any> | undefined;
      const snapshot = providerMeta?.provider_snapshot;

      return {
        id: String(sub.id),
        status: normalizedStatus,
        plan_title: sub.plan?.title || 'Без названия',
        plan_amount: planAmount,
        plan_currency: sub.plan?.currency || 'BYN',
        customer_email: sub.customer?.email || '',
        customer_name:
          [sub.customer?.first_name, sub.customer?.last_name].filter(Boolean).join(' ') || sub.credit_card?.holder || '',
        card_last4: sub.credit_card?.last_4 || '',
        card_brand: sub.credit_card?.brand || '',
        created_at: sub.created_at || '',
        next_billing_at: sub.next_billing_at || '',
        linked_subscription_id: linkedSubId,
        linked_user_id: linkedUserId,
        linked_profile_name: profile?.name || profile?.email || null,
        is_orphan: !linkedSubId && !linkedUserId,
        snapshot_state: snapshot?.state ? normalizeStatus(snapshot.state) : undefined,
        snapshot_at: providerMeta?.snapshot_at,
        cancellation_capability: providerMeta?.cancellation_capability,
        needs_support: providerMeta?.needs_support,
        details_missing: !!(sub as any)._details_missing,
      };
    });

    result.sort((a, b) => {
      const statusOrder: Record<string, number> = { active: 0, trial: 1, pending: 2, past_due: 3, canceled: 4 };
      const aOrder = statusOrder[a.status] ?? 5;
      const bOrder = statusOrder[b.status] ?? 5;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.next_billing_at || '').localeCompare(b.next_billing_at || '');
    });

    console.log(`[bepaid-list-subs] Found ${result.length} total subscriptions, ${result.filter((s) => s.is_orphan).length} orphans`);

    // PATCH-I++: Enhanced debug with all diagnostic info
    return new Response(
      JSON.stringify({
        subscriptions: result,
        stats: {
          total: result.length,
          active: result.filter((s) => s.status === 'active').length,
          trial: result.filter((s) => s.status === 'trial').length,
          pending: result.filter((s) => s.status === 'pending').length,
          canceled: result.filter((s) => s.status === 'canceled').length,
          orphans: result.filter((s) => s.is_orphan).length,
          linked: result.filter((s) => !s.is_orphan).length,
        },
        debug: {
          creds_source: credentials.source,
          integration_status: credentials.instanceStatus || null,
          shop_id_present: true,
          secret_present: true,
          hosts_tried: BEPAID_HOSTS,
          paths_tried: LIST_PATHS,
          api_list_count: apiListCount,
          list_attempts: listAttempts.slice(0, 10), // Limit for response size
          provider_subscriptions_count: providerSubs?.length || 0,
          details_fetched_count: detailsFetched,
          details_failed_count: detailsFailed,
          detail_errors_by_status: detailErrorsByStatus,
          detail_attempts_sample: detailAttemptsSample,
          result_count: result.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    console.error('Error listing subscriptions:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
