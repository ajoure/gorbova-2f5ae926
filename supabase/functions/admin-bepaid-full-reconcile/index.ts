import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * admin-bepaid-full-reconcile
 * 
 * Full reconciliation of bePaid transactions with payments_v2.
 * bePaid is the source of truth - adds missing, fixes amounts/statuses.
 * 
 * STOP GUARDS:
 * - Admin-only (has_role check)
 * - dry_run=true by default
 * - Max 5000 transactions per run
 * - Timeout protection with cursor_next
 * - Never deletes payments (only INSERT/UPDATE)
 * - Original values preserved in meta.reconcile_original
 */

interface ReconcileRequest {
  from_date?: string;      // default: '2026-01-01'
  to_date?: string;        // default: today
  dry_run?: boolean;       // default: true
  limit?: number;          // max transactions per run (default 2000, max 5000)
  cursor?: string | null;  // continuation token
  allow_over_limit?: boolean; // bypass limit check
}

interface ReconcileResponse {
  ok: boolean;
  dry_run: boolean;
  period: { from_date: string; to_date: string };
  fetched: {
    bepaid_total: number;
    pages: number;
    cursor_next: string | null;
  };
  compared: { our_total: number };
  changes: {
    added: number;
    updated_amount: number;
    updated_status: number;
    updated_paid_at: number;
    unchanged: number;
    errors: number;
  };
  samples: {
    added: Array<{ uid: string; amount: number; status: string; paid_at: string }>;
    discrepancies_amount: Array<{ uid: string; our_amount: number; bepaid_amount: number; fixed: boolean }>;
    discrepancies_status: Array<{ uid: string; our_status: string; bepaid_status: string; fixed: boolean }>;
    discrepancies_paid_at: Array<{ uid: string; our_paid_at: string; bepaid_paid_at: string; fixed: boolean }>;
    errors: Array<{ uid: string; error: string }>;
  };
  error?: string;
}

// Normalize bePaid status to our payment_status enum
function normalizeStatus(status: string): 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'canceled' {
  switch (status?.toLowerCase()) {
    case 'successful':
    case 'success':
      return 'succeeded';
    case 'failed':
    case 'declined':
    case 'expired':
    case 'error':
      return 'failed';
    case 'incomplete':
    case 'processing':
      return 'processing';
    case 'pending':
      return 'pending';
    case 'refunded':
    case 'voided':
      return 'refunded';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      return 'pending';
  }
}

// Format date for bePaid Reports API
function formatBepaidDate(d: Date): string {
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

// Fetch transactions from bePaid Reports API
async function fetchFromBepaid(
  auth: string,
  fromDate: Date,
  toDate: Date,
  maxTransactions: number,
  startTime: number
): Promise<{ success: boolean; transactions: any[]; error?: string; pages: number }> {
  const endpoints = [
    "https://gateway.bepaid.by/transactions",
    "https://api.bepaid.by/transactions",
  ];

  const fromDateISO = fromDate.toISOString();
  const toDateISO = toDate.toISOString();
  
  let allTransactions: any[] = [];
  let pages = 0;
  let hasMore = true;
  let currentPage = 1;
  const perPage = 100;
  const maxPages = Math.ceil(maxTransactions / perPage);
  const maxRuntimeMs = 50000; // 50 seconds timeout protection

  for (const endpoint of endpoints) {
    console.log(`[full-reconcile] Trying endpoint: ${endpoint}`);
    
    try {
      allTransactions = [];
      pages = 0;
      hasMore = true;
      currentPage = 1;

      while (hasMore && pages < maxPages && allTransactions.length < maxTransactions) {
        // Timeout protection
        if (Date.now() - startTime > maxRuntimeMs) {
          console.log(`[full-reconcile] Timeout protection triggered at page ${currentPage}`);
          return {
            success: true,
            transactions: allTransactions,
            pages,
            error: `Timeout after ${pages} pages, ${allTransactions.length} transactions`
          };
        }

        const url = `${endpoint}?created_at_from=${encodeURIComponent(fromDateISO)}&created_at_to=${encodeURIComponent(toDateISO)}&per_page=${perPage}&page=${currentPage}`;
        
        console.log(`[full-reconcile] Fetching page ${currentPage}: ${url}`);
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
            "X-Api-Version": "3",
          },
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            console.log(`[full-reconcile] Auth failed for ${endpoint}`);
            break; // Try next endpoint
          }
          const errText = await response.text();
          console.log(`[full-reconcile] Error ${response.status}: ${errText.substring(0, 200)}`);
          break;
        }

        const data = await response.json();
        const transactions = data.transactions || data.data?.transactions || [];
        
        console.log(`[full-reconcile] Page ${currentPage}: got ${transactions.length} transactions`);
        
        if (transactions.length === 0) {
          hasMore = false;
        } else {
          allTransactions.push(...transactions);
          pages++;
          currentPage++;
          
          if (transactions.length < perPage) {
            hasMore = false;
          }
        }
      }

      if (allTransactions.length > 0) {
        console.log(`[full-reconcile] Success: ${allTransactions.length} transactions from ${endpoint}`);
        return { success: true, transactions: allTransactions, pages };
      }
    } catch (err) {
      console.error(`[full-reconcile] Error with ${endpoint}:`, err);
    }
  }

  // Fallback: try Reports API (POST)
  console.log(`[full-reconcile] Falling back to Reports API`);
  const reportsEndpoints = [
    "https://api.bepaid.by/api/reports",
    "https://gateway.bepaid.by/api/reports",
  ];

  const requestBody = {
    report_params: {
      date_type: "created_at",
      from: formatBepaidDate(fromDate),
      to: formatBepaidDate(toDate),
      status: "all",
      payment_method_type: "all",
      time_zone: "Europe/Minsk"
    }
  };

  for (const endpoint of reportsEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Api-Version": "2",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const transactions = data.transactions || data.data?.transactions || data.items || [];
        if (transactions.length > 0) {
          console.log(`[full-reconcile] Reports API success: ${transactions.length} transactions`);
          return { success: true, transactions: transactions.slice(0, maxTransactions), pages: 1 };
        }
      }
    } catch (err) {
      console.error(`[full-reconcile] Reports API error:`, err);
    }
  }

  return { success: false, transactions: [], error: "All bePaid endpoints failed", pages: 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // 1. Auth check - admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: hasAdminRole } = await supabase.rpc('has_role', { role_name: 'admin' });
    if (!hasAdminRole) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request
    const body: ReconcileRequest = await req.json().catch(() => ({}));
    const from_date = body.from_date || '2026-01-01';
    const to_date = body.to_date || new Date().toISOString().split('T')[0];
    const dry_run = body.dry_run !== false; // Default true
    const requestedLimit = body.limit || 2000;
    const limit = body.allow_over_limit ? Math.min(requestedLimit, 10000) : Math.min(requestedLimit, 5000);

    console.log(`[full-reconcile] Starting: from=${from_date}, to=${to_date}, dry_run=${dry_run}, limit=${limit}`);

    // 3. Get bePaid credentials
    const { data: bepaidInstance } = await supabase
      .from("integration_instances")
      .select("id, config")
      .eq("provider", "bepaid")
      .in("status", ["active", "connected"])
      .single();

    if (!bepaidInstance?.config) {
      return new Response(JSON.stringify({ ok: false, error: "No bePaid integration configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shopId = bepaidInstance.config.shop_id;
    const secretKey = bepaidInstance.config.secret_key || Deno.env.get("BEPAID_SECRET_KEY");
    
    if (!shopId || !secretKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing bePaid credentials" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = btoa(`${shopId}:${secretKey}`);

    // 4. Calculate date range with timezone buffer
    const fromDate = new Date(`${from_date}T00:00:00Z`);
    fromDate.setHours(fromDate.getHours() - 12); // -12h buffer for timezone
    
    const toDate = new Date(`${to_date}T23:59:59Z`);
    toDate.setHours(toDate.getHours() + 12); // +12h buffer for timezone

    console.log(`[full-reconcile] Date range with buffer: ${fromDate.toISOString()} to ${toDate.toISOString()}`);

    // 5. Fetch transactions from bePaid
    const { success: fetchSuccess, transactions: bepaidTx, error: fetchError, pages } = 
      await fetchFromBepaid(auth, fromDate, toDate, limit, startTime);

    if (!fetchSuccess || bepaidTx.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: fetchError || "No transactions found in bePaid",
        dry_run,
        period: { from_date, to_date },
        fetched: { bepaid_total: 0, pages: 0, cursor_next: null },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[full-reconcile] Fetched ${bepaidTx.length} transactions from bePaid`);

    // 6. Get our payments for the period
    const { data: ourPayments, error: ourError } = await supabase
      .from("payments_v2")
      .select("id, provider_payment_id, amount, status, paid_at, meta")
      .gte("paid_at", from_date)
      .lte("paid_at", to_date + "T23:59:59Z");

    if (ourError) {
      console.error("[full-reconcile] Error fetching our payments:", ourError);
    }

    const ourMap = new Map((ourPayments || []).map(p => [p.provider_payment_id, p]));
    console.log(`[full-reconcile] Found ${ourMap.size} payments in our DB for this period`);

    // 7. Compare and reconcile
    const result: ReconcileResponse = {
      ok: true,
      dry_run,
      period: { from_date, to_date },
      fetched: {
        bepaid_total: bepaidTx.length,
        pages,
        cursor_next: bepaidTx.length >= limit ? "continue" : null,
      },
      compared: { our_total: ourMap.size },
      changes: {
        added: 0,
        updated_amount: 0,
        updated_status: 0,
        updated_paid_at: 0,
        unchanged: 0,
        errors: 0,
      },
      samples: {
        added: [],
        discrepancies_amount: [],
        discrepancies_status: [],
        discrepancies_paid_at: [],
        errors: [],
      },
    };

    const maxSamples = 20;
    const processedUids = new Set<string>();

    for (const beTx of bepaidTx) {
      const uid = beTx.uid || beTx.id;
      
      if (!uid || processedUids.has(uid)) continue;
      processedUids.add(uid);

      try {
        const bepaidAmount = Number(beTx.amount) / 100; // kopeks to rubles
        const bepaidStatus = normalizeStatus(beTx.status);
        const bepaidPaidAt = beTx.created_at || beTx.paid_at || beTx.completed_at;

        const ourPayment = ourMap.get(uid);

        if (!ourPayment) {
          // New payment - INSERT
          result.changes.added++;
          
          if (result.samples.added.length < maxSamples) {
            result.samples.added.push({
              uid,
              amount: bepaidAmount,
              status: bepaidStatus,
              paid_at: bepaidPaidAt,
            });
          }

          if (!dry_run) {
            // Extract additional data from bePaid transaction
            const cardLast4 = beTx.credit_card?.last_4 || beTx.card?.last_4 || null;
            const cardBrand = beTx.credit_card?.brand || beTx.card?.brand || null;
            const txType = beTx.type || beTx.transaction_type || 'payment';
            const productName = beTx.description || beTx.order?.description || null;
            const trackingId = beTx.tracking_id;
            
            // Try to parse order_id from tracking_id
            let orderId = null;
            if (trackingId) {
              const parts = trackingId.split("_");
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (parts.length >= 1 && uuidRegex.test(parts[0])) {
                orderId = parts[0];
              }
            }

            const { error: insertError } = await supabase
              .from("payments_v2")
              .insert({
                provider_payment_id: uid,
                provider: "bepaid",
                amount: bepaidAmount,
                currency: beTx.currency || "BYN",
                status: bepaidStatus,
                paid_at: bepaidPaidAt,
                card_last4: cardLast4,
                card_brand: cardBrand,
                transaction_type: txType,
                product_name_raw: productName,
                order_id: orderId,
                meta: {
                  tracking_id: trackingId,
                  bepaid_raw: beTx,
                  reconcile_source: "admin-bepaid-full-reconcile",
                  reconcile_at: new Date().toISOString(),
                },
              });

            if (insertError) {
              console.error(`[full-reconcile] Insert error for ${uid}:`, insertError);
              result.changes.added--;
              result.changes.errors++;
              if (result.samples.errors.length < maxSamples) {
                result.samples.errors.push({ uid, error: insertError.message });
              }
            }
          }
        } else {
          // Existing payment - check for discrepancies
          let hasChanges = false;
          const updates: Record<string, any> = {};
          const originalValues: Record<string, any> = {};

          // Check amount
          const amountDiff = Math.abs(ourPayment.amount - bepaidAmount);
          if (amountDiff > 0.01) {
            originalValues.amount = ourPayment.amount;
            updates.amount = bepaidAmount;
            result.changes.updated_amount++;
            hasChanges = true;
            
            if (result.samples.discrepancies_amount.length < maxSamples) {
              result.samples.discrepancies_amount.push({
                uid,
                our_amount: ourPayment.amount,
                bepaid_amount: bepaidAmount,
                fixed: !dry_run,
              });
            }
          }

          // Check status
          if (ourPayment.status !== bepaidStatus) {
            originalValues.status = ourPayment.status;
            updates.status = bepaidStatus;
            result.changes.updated_status++;
            hasChanges = true;
            
            if (result.samples.discrepancies_status.length < maxSamples) {
              result.samples.discrepancies_status.push({
                uid,
                our_status: ourPayment.status,
                bepaid_status: bepaidStatus,
                fixed: !dry_run,
              });
            }
          }

          // Check paid_at (allow 1 minute tolerance)
          if (bepaidPaidAt && ourPayment.paid_at) {
            const ourDate = new Date(ourPayment.paid_at).getTime();
            const bepaidDate = new Date(bepaidPaidAt).getTime();
            if (Math.abs(ourDate - bepaidDate) > 60000) { // > 1 minute difference
              originalValues.paid_at = ourPayment.paid_at;
              updates.paid_at = bepaidPaidAt;
              result.changes.updated_paid_at++;
              hasChanges = true;
              
              if (result.samples.discrepancies_paid_at.length < maxSamples) {
                result.samples.discrepancies_paid_at.push({
                  uid,
                  our_paid_at: ourPayment.paid_at,
                  bepaid_paid_at: bepaidPaidAt,
                  fixed: !dry_run,
                });
              }
            }
          }

          if (hasChanges && !dry_run) {
            // Preserve original values in meta
            updates.meta = {
              ...(ourPayment.meta || {}),
              reconcile_original: {
                ...(ourPayment.meta?.reconcile_original || {}),
                ...originalValues,
              },
              reconcile_at: new Date().toISOString(),
              reconcile_source: "admin-bepaid-full-reconcile",
            };
            updates.updated_at = new Date().toISOString();

            const { error: updateError } = await supabase
              .from("payments_v2")
              .update(updates)
              .eq("id", ourPayment.id);

            if (updateError) {
              console.error(`[full-reconcile] Update error for ${uid}:`, updateError);
              result.changes.errors++;
              if (result.samples.errors.length < maxSamples) {
                result.samples.errors.push({ uid, error: updateError.message });
              }
            }
          }

          if (!hasChanges) {
            result.changes.unchanged++;
          }
        }
      } catch (err: any) {
        console.error(`[full-reconcile] Error processing ${uid}:`, err);
        result.changes.errors++;
        if (result.samples.errors.length < maxSamples) {
          result.samples.errors.push({ uid, error: err.message });
        }
      }
    }

    // 8. Write audit log (SYSTEM ACTOR) - only on execute
    if (!dry_run) {
      await supabase.from("audit_logs").insert({
        actor_type: "system",
        actor_label: "admin-bepaid-full-reconcile",
        actor_user_id: null,
        action: "bepaid_full_reconcile",
        meta: {
          triggered_by: user.id,
          period: { from_date, to_date },
          dry_run: false,
          bepaid_total: result.fetched.bepaid_total,
          our_total: result.compared.our_total,
          changes: result.changes,
          sample_uids_added: result.samples.added.slice(0, 5).map(s => s.uid),
          sample_uids_fixed_amount: result.samples.discrepancies_amount.slice(0, 5).map(s => s.uid),
          sample_uids_fixed_status: result.samples.discrepancies_status.slice(0, 5).map(s => s.uid),
          runtime_ms: Date.now() - startTime,
        },
      });
    }

    const runtime = Date.now() - startTime;
    console.log(`[full-reconcile] Completed in ${runtime}ms: added=${result.changes.added}, updated_amount=${result.changes.updated_amount}, updated_status=${result.changes.updated_status}, unchanged=${result.changes.unchanged}, errors=${result.changes.errors}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[full-reconcile] Critical error:", err);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: err.message,
      dry_run: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
