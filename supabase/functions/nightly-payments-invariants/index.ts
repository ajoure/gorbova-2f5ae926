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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const invariants: any[] = [];

    // INV-18: recent orphans (24h)
    const { data: recentOrphans } = await supabase
      .from("provider_webhook_orphans")
      .select("id, reason, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    const orphanCount = (recentOrphans || []).length;
    invariants.push({
      name: "INV-18: recent orphans (24h)",
      passed: orphanCount === 0,
      count: orphanCount,
      samples: (recentOrphans || []).slice(0, 5).map((o: any) => ({ reason: o.reason })),
      description: "Orphans created by webhook processing (24h).",
    });

    if ((orphanCount || 0) > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify-admins`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            message:
              `⚠️ INV-18: ${orphanCount} необработанных orphan(s) за 24ч\n\nПричины: ${
                [...new Set((recentOrphans || []).map((o: any) => o.reason))].join(", ")
              }`,
            source: "nightly-payments-invariants",
          }),
        });
      } catch (_) {}
    }

    // -------------------------
    // INV-19A: BePaid sbs_* missing in provider_subscriptions
    // -------------------------
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data: payRows } = await supabase
      .from("payments_v2")
      .select("id, meta, provider_response, created_at")
      .eq("provider", "bepaid")
      .eq("status", "succeeded")
      .gte("created_at", seventyTwoHoursAgo)
      .limit(200);

    const { data: ordRows } = await supabase
      .from("orders_v2")
      .select("id, meta, created_at")
      .gte("created_at", seventyTwoHoursAgo)
      .limit(200);

    const allSbsIds = new Set<string>();

    for (const p of payRows || []) {
      const metaSbs = (p.meta as any)?.bepaid_subscription_id;
      if (typeof metaSbs === "string" && metaSbs.startsWith("sbs_")) allSbsIds.add(metaSbs);

      const respSbs = (p.provider_response as any)?.subscription_id;
      if (typeof respSbs === "string" && respSbs.startsWith("sbs_")) allSbsIds.add(respSbs);
    }

    for (const o of ordRows || []) {
      const metaSbs = (o.meta as any)?.bepaid_subscription_id;
      if (typeof metaSbs === "string" && metaSbs.startsWith("sbs_")) allSbsIds.add(metaSbs);
    }

    let inv19aMissing: string[] = [];
    if (allSbsIds.size > 0) {
      const { data: existingPS } = await supabase
        .from("provider_subscriptions")
        .select("provider_subscription_id")
        .eq("provider", "bepaid")
        .in("provider_subscription_id", [...allSbsIds]);

      const existingSet = new Set((existingPS || []).map((ps: any) => ps.provider_subscription_id));
      inv19aMissing = [...allSbsIds].filter((id) => !existingSet.has(id));
    }

    invariants.push({
      name: "INV-19A: BePaid sbs_* missing in provider_subscriptions",
      passed: inv19aMissing.length === 0,
      count: inv19aMissing.length,
      samples: inv19aMissing.slice(0, 5).map((id) => ({ sbs_id: id })),
      description:
        "BePaid subscription IDs found in payments/orders (72h) but missing from provider_subscriptions. Run admin-bepaid-backfill.",
    });

    if (inv19aMissing.length > 0) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify-admins`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            message:
              `🚨 INV-19A CRITICAL: ${inv19aMissing.length} BePaid sbs_* ID(s) найдены в платежах/заказах, но отсутствуют в provider_subscriptions!\n\nРекомендация: запустить admin-bepaid-backfill execute`,
            source: "nightly-payments-invariants",
          }),
        });
      } catch (_) {}
    }

    // -------------------------
    // INV-19B: Token recurring without provider_subscriptions
    // -------------------------
    const { data: inv19bSubs } = await supabase
      .from("subscriptions_v2")
      .select("id, user_id, product_id")
      .in("status", ["active", "trial", "past_due"])
      .eq("auto_renew", true)
      .limit(500);

    let inv19bMissing = 0;

    if (inv19bSubs && inv19bSubs.length > 0) {
      const inv19bUserIds = [...new Set(inv19bSubs.map((s: any) => s.user_id))];

      const { data: inv19bPMs } = await supabase
        .from("payment_methods")
        .select("user_id")
        .eq("provider", "bepaid")
        .eq("status", "active")
        .in("user_id", inv19bUserIds);

      const usersWithPM = new Set((inv19bPMs || []).map((pm: any) => pm.user_id));
      const relevantSubs = inv19bSubs.filter((s: any) => usersWithPM.has(s.user_id));

      if (relevantSubs.length > 0) {
        const { data: inv19bExisting } = await supabase
          .from("provider_subscriptions")
          .select("subscription_v2_id")
          .eq("provider", "bepaid")
          .in("subscription_v2_id", relevantSubs.map((s: any) => s.id));

        const coveredSubIds = new Set((inv19bExisting || []).map((ps: any) => ps.subscription_v2_id));
        inv19bMissing = relevantSubs.filter((s: any) => !coveredSubIds.has(s.id)).length;
      }
    }

    const inv19bCritical = inv19bMissing > 20;
    invariants.push({
      name: "INV-19B: Token recurring without provider_subscriptions",
      passed: inv19bMissing === 0,
      count: inv19bMissing,
      samples: [],
      description:
        `Active auto_renew subscriptions with bepaid payment_method but no provider_subscriptions row (by subscription_v2_id). ${
          inv19bCritical ? "CRITICAL" : "WARNING"
        }. Run admin-bepaid-backfill.`,
    });

    if (inv19bCritical) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/telegram-notify-admins`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            message:
              `🚨 INV-19B CRITICAL: ${inv19bMissing} активных auto_renew подписок без provider_subscriptions!\n\nРекомендация: запустить admin-bepaid-backfill execute`,
            source: "nightly-payments-invariants",
          }),
        });
      } catch (_) {}
    }

    const passedCount = invariants.filter((i) => i.passed).length;
    const failedCount = invariants.filter((i) => !i.passed).length;

    return json({
      ok: failedCount === 0,
      passed: passedCount,
      failed: failedCount,
      invariants,
      duration_ms: Date.now() - startTime,
    });
  } catch (e: any) {
    console.error("[nightly-payments-invariants] Fatal error:", e);
    return json({ error: e?.message || "Unknown error", duration_ms: Date.now() - startTime }, 500);
  }
});
