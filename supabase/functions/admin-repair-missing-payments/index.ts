/// <reference deno.land/x/types/index.d.ts />

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: verify JWT (verify_jwt=true in config.toml, but double-check role)
    const authHeaderVal = req.headers.get("Authorization");
    if (!authHeaderVal?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeaderVal } },
    });

    const { data: userRes, error: authError } = await supabaseAuth.auth.getUser();
    const user = userRes?.user;
    if (authError || !user) return json({ error: "Invalid token" }, 401);

    // Service client for DB
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Admin/superadmin check
    const { data: isAdmin } = await supabase.rpc("has_role_v2", { _user_id: user.id, _role_code: "admin" });
    const { data: isSuperAdmin } = await supabase.rpc("has_role_v2", { _user_id: user.id, _role_code: "super_admin" });

    if (!isAdmin && !isSuperAdmin) {
      return json({ error: "Admin access required" }, 403);
    }

    // Params
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default true
    const sinceDays = Math.min(Number(body.since_days) || 90, 365);
    const limit = Math.min(Number(body.limit) || 200, 500);

    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: Find paid orders without payments_v2
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      "inv20_paid_orders_without_payments",
      { p_since: sinceDate, p_limit: limit }
    );

    // Get detailed order data for the missing ones
    const rpcRow = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    const totalMissing = Number(rpcRow?.count_total ?? 0);

    if (totalMissing === 0) {
      return json({
        ok: true,
        dry_run: dryRun,
        total_missing: 0,
        repaired: 0,
        orphaned: 0,
        errors: [],
        duration_ms: Date.now() - startTime,
      });
    }

    // Fetch actual order details for repair
    const { data: missingOrders, error: moErr } = await supabase
      .from("orders_v2")
      .select("id, order_number, user_id, profile_id, final_price, status, meta, created_at, product_id")
      .eq("status", "paid")
      .gte("created_at", sinceDate)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (moErr) return json({ error: moErr.message }, 500);

    // Filter to only those without payments
    const orderIds = (missingOrders || []).map((o: any) => o.id);
    const { data: existingPayments } = await supabase
      .from("payments_v2")
      .select("order_id")
      .in("order_id", orderIds);

    const paidOrderIds = new Set((existingPayments || []).map((p: any) => p.order_id));
    const ordersToRepair = (missingOrders || []).filter((o: any) => !paidOrderIds.has(o.id));

    if (ordersToRepair.length === 0) {
      return json({
        ok: true,
        dry_run: dryRun,
        total_missing: totalMissing,
        repaired: 0,
        orphaned: 0,
        errors: [],
        note: "All orders already have payments (race condition or limit mismatch)",
        duration_ms: Date.now() - startTime,
      });
    }

    // Step 2: For each order, find transaction_uid via 2 strategies
    const repairOrderIds = ordersToRepair.map((o: any) => o.id);

    // Strategy 1: webhook_events by tracking_id = 'link:order:{order_id}'
    const trackingIds = repairOrderIds.map((id: string) => `link:order:${id}`);
    const { data: webhookEvents } = await supabase
      .from("webhook_events")
      .select("tracking_id, transaction_uid, created_at, meta")
      .in("tracking_id", trackingIds);

    const uidByTrackingId = new Map<string, { uid: string; created_at: string }>();
    for (const we of webhookEvents || []) {
      if (we.transaction_uid && we.tracking_id) {
        const orderId = we.tracking_id.replace("link:order:", "");
        if (!uidByTrackingId.has(orderId)) {
          uidByTrackingId.set(orderId, { uid: we.transaction_uid, created_at: we.created_at });
        }
      }
    }

    // Strategy 2: webhook_events by order_number in meta
    const orderNumbers = ordersToRepair
      .filter((o: any) => !uidByTrackingId.has(o.id))
      .map((o: any) => o.order_number)
      .filter(Boolean);

    if (orderNumbers.length > 0) {
      // Search webhook_events for tracking_ids containing order numbers
      for (const order of ordersToRepair) {
        if (uidByTrackingId.has(order.id)) continue;

        // Try various tracking_id patterns
        const patterns = [
          `link:order:${order.id}`,
          `subv2:${order.id}`,
          order.id, // plain UUID
        ];

        for (const pattern of patterns) {
          const { data: we2 } = await supabase
            .from("webhook_events")
            .select("transaction_uid, created_at")
            .eq("tracking_id", pattern)
            .not("transaction_uid", "is", null)
            .order("created_at", { ascending: false })
            .limit(1);

          if (we2 && we2.length > 0 && we2[0].transaction_uid) {
            uidByTrackingId.set(order.id, { uid: we2[0].transaction_uid, created_at: we2[0].created_at });
            break;
          }
        }

        // Strategy 2b: search by meta->order_id in audit_logs
        if (!uidByTrackingId.has(order.id)) {
          const { data: auditRows } = await supabase
            .from("audit_logs")
            .select("meta")
            .eq("action", "bepaid.webhook.payment_processed")
            .limit(50);

          for (const ar of auditRows || []) {
            const meta = ar.meta as any;
            if (meta?.order_id === order.id && meta?.tx_uid) {
              uidByTrackingId.set(order.id, { uid: meta.tx_uid, created_at: meta.paid_at || order.created_at });
              break;
            }
          }
        }
      }
    }

    // Step 3: Repair
    let repaired = 0;
    let orphaned = 0;
    const errors: string[] = [];
    const repairedDetails: any[] = [];
    const orphanedDetails: any[] = [];

    for (const order of ordersToRepair) {
      const uidInfo = uidByTrackingId.get(order.id);

      if (!uidInfo) {
        // No transaction_uid found — orphan
        orphaned++;
        orphanedDetails.push({ order_number: order.order_number, order_id: order.id });

        if (!dryRun) {
          try {
            await supabase.from("provider_webhook_orphans").upsert({
              provider: "bepaid",
              provider_payment_id: `repair:${order.id}`,
              reason: "missing_transaction_uid_repair",
              raw_data: {
                order_id: order.id,
                order_number: order.order_number,
                amount: order.final_price,
                repair_attempted_at: new Date().toISOString(),
              },
              processed: false,
            }, { onConflict: "provider,provider_payment_id", ignoreDuplicates: true });
          } catch (_) {}
        }
        continue;
      }

      // Determine is_recurring
      const orderNum = order.order_number || "";
      const isRecurring = orderNum.startsWith("SUB-LINK-") || orderNum.startsWith("REN-");
      const sbsId = (order.meta as any)?.bepaid_subscription_id || null;

      repairedDetails.push({
        order_number: order.order_number,
        order_id: order.id,
        transaction_uid: uidInfo.uid,
      });

      if (dryRun) {
        repaired++;
        continue;
      }

      // Insert payment (idempotent by provider_payment_id)
      const { error: insertErr } = await supabase
        .from("payments_v2")
        .insert({
          order_id: order.id,
          user_id: order.user_id,
          profile_id: order.profile_id || null,
          product_id: order.product_id || null,
          amount: order.final_price,
          currency: "BYN",
          status: "succeeded",
          provider: "bepaid",
          provider_payment_id: uidInfo.uid,
          is_recurring: isRecurring,
          paid_at: uidInfo.created_at,
          meta: {
            source: "repair_missing_payment",
            repaired_at: new Date().toISOString(),
            tracking_id: `link:order:${order.id}`,
            bepaid_subscription_id: sbsId,
            repaired_by: user.id,
          },
        });

      if (insertErr) {
        // Could be duplicate — check if already exists
        if (insertErr.code === "23505") {
          console.log(`[repair] Payment already exists for order ${order.order_number} (uid=${uidInfo.uid})`);
          repaired++; // Count as success (idempotent)
        } else {
          errors.push(`Insert failed for ${order.order_number}: ${insertErr.message}`);
        }
      } else {
        repaired++;
      }
    }

    // Audit log
    const auditAction = dryRun ? "admin.repair_missing_payment_dry_run" : "admin.repair_missing_payment";
    try {
      await supabase.from("audit_logs").insert({
        actor_type: dryRun ? "system" : "admin",
        actor_user_id: dryRun ? null : user.id,
        action: auditAction,
        meta: {
          total_missing: totalMissing,
          repaired,
          orphaned,
          errors_count: errors.length,
          since_days: sinceDays,
          limit,
          initiated_by: user.id,
        },
      });
    } catch (_) {}

    return json({
      ok: errors.length === 0,
      dry_run: dryRun,
      total_missing: totalMissing,
      repaired,
      orphaned,
      errors: errors.slice(0, 20),
      repaired_details: repairedDetails.slice(0, 20),
      orphaned_details: orphanedDetails.slice(0, 20),
      duration_ms: Date.now() - startTime,
    });
  } catch (e: any) {
    console.error("[admin-repair-missing-payments] Fatal error:", e);
    return json({ error: e?.message || "Unknown error", duration_ms: Date.now() - startTime }, 500);
  }
});
