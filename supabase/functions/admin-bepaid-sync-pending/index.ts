/// <reference deno.land/x/types/index.d.ts />

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SyncMode = "missing_snapshot" | "stale_or_missing";

interface SyncParams {
  dry_run: boolean;
  limit: number;
  max_age_days: number;
  mode: SyncMode;
  batch_size: number;
}

interface SyncResult {
  dry_run: boolean;
  mode: SyncMode;
  candidates_found: number;
  synced: number;
  became_active: number;
  became_canceled: number;
  became_failed: number;
  billing_type_updated: number;
  errors: string[];
  samples: Array<{ id: string; old_state: string; new_state: string }>;
  duration_ms: number;
}

function normalizeState(raw: string | null | undefined): string {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "cancelled") return "canceled";
  if (!s) return "unknown";
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const started = Date.now();

  try {
    // Auth: verify admin/super_admin
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check role
    const { data: isAdmin } = await serviceClient.rpc("has_role_v2", {
      _user_id: user.id,
      _role_code: "admin",
    });
    const { data: isSuperAdmin } = await serviceClient.rpc("has_role_v2", {
      _user_id: user.id,
      _role_code: "super_admin",
    });

    if (!isAdmin && !isSuperAdmin) {
      return json({ error: "Forbidden: admin or super_admin required" }, 403);
    }

    // Parse params
    const body = await req.json().catch(() => ({}));
    const params: SyncParams = {
      dry_run: body.dry_run !== false, // default true
      limit: Math.min(Number(body.limit) || 200, 200),
      max_age_days: Number(body.max_age_days) || 7,
      mode: body.mode === "missing_snapshot" ? "missing_snapshot" : "stale_or_missing",
      batch_size: Math.min(Number(body.batch_size) || 20, 50),
    };

    // Build query for candidates
    let query = serviceClient
      .from("provider_subscriptions")
      .select("id, provider_subscription_id, state, meta, user_id, profile_id, subscription_v2_id")
      .like("provider_subscription_id", "sbs_%")
      .in("state", ["pending", "failed"])
      .limit(params.limit)
      .order("created_at", { ascending: true });

    // Both modes: fetch all pending/failed candidates, filter in code
    // (supabase-js .is() on JSON paths is unreliable)

    const { data: candidates, error: fetchErr } = await query;
    if (fetchErr) {
      return json({ error: `DB fetch error: ${fetchErr.message}` }, 500);
    }

    // Filter stale snapshots in code
    const now = Date.now();
    const maxAgeMs = params.max_age_days * 24 * 60 * 60 * 1000;
    const filtered = (candidates || []).filter((c: any) => {
      if (params.mode === "missing_snapshot") return true;
      const snapshotAt = c.meta?.snapshot_at;
      if (!snapshotAt) return true; // no snapshot
      const age = now - new Date(snapshotAt).getTime();
      return age > maxAgeMs; // stale
    });

    const result: SyncResult = {
      dry_run: params.dry_run,
      mode: params.mode,
      candidates_found: filtered.length,
      synced: 0,
      became_active: 0,
      became_canceled: 0,
      became_failed: 0,
      billing_type_updated: 0,
      errors: [],
      samples: [],
      duration_ms: 0,
    };

    if (params.dry_run || filtered.length === 0) {
      result.duration_ms = Date.now() - started;
      
      // Audit log
      await serviceClient.from("audit_logs").insert({
        action: "bepaid_sync_pending",
        actor_type: "system",
        actor_label: "admin-bepaid-sync-pending",
        meta: {
          triggered_by_email: user.email,
          triggered_by_id: user.id,
          dry_run: true,
          candidates_found: result.candidates_found,
          mode: params.mode,
        },
      });

      return json(result);
    }

    // Execute sync in batches
    const bepaidSecretKey = Deno.env.get("BEPAID_SECRET_KEY");
    if (!bepaidSecretKey) {
      return json({ error: "BEPAID_SECRET_KEY not configured" }, 500);
    }

    const bepaidAuth = btoa(`${bepaidSecretKey}:`);
    const BEPAID_API = "https://api.bepaid.by";
    let errorCount = 0;
    const MAX_ERRORS = 5;

    for (let i = 0; i < filtered.length; i += params.batch_size) {
      if (errorCount >= MAX_ERRORS) {
        result.errors.push(`STOP: reached ${MAX_ERRORS} consecutive errors, aborting`);
        break;
      }

      const batch = filtered.slice(i, i + params.batch_size);

      for (const candidate of batch) {
        const sbsId = candidate.provider_subscription_id;
        const oldState = candidate.state;

        try {
          // Fetch from bePaid API
          const resp = await fetch(`${BEPAID_API}/subscriptions/${sbsId}`, {
            headers: {
              Authorization: `Basic ${bepaidAuth}`,
              Accept: "application/json",
            },
          });

          if (!resp.ok) {
            const errText = await resp.text();
            result.errors.push(`${sbsId}: HTTP ${resp.status} - ${errText.slice(0, 100)}`);
            errorCount++;
            continue;
          }

          const apiData = await resp.json();
          const sub = apiData?.subscription || apiData;
          const newState = normalizeState(sub?.state);
          const snapshotAt = new Date().toISOString();

          // Build sanitized snapshot (no PII)
          const snapshot = {
            id: sub?.id,
            state: sub?.state,
            plan: sub?.plan ? {
              amount: sub.plan?.amount,
              currency: sub.plan?.currency,
              title: sub.plan?.title,
            } : null,
            next_billing_at: sub?.next_billing_at,
            created_at: sub?.created_at,
            cancellation_capability: sub?.cancellation_capability,
          };

          // Update provider_subscriptions
          const newMeta = {
            ...(candidate.meta || {}),
            snapshot,
            snapshot_at: snapshotAt,
            cancellation_capability: sub?.cancellation_capability,
          };

          const { error: updateErr } = await serviceClient
            .from("provider_subscriptions")
            .update({
              state: newState,
              meta: newMeta,
              next_charge_at: sub?.next_billing_at || null,
            })
            .eq("id", candidate.id);

          if (updateErr) {
            result.errors.push(`${sbsId}: update error - ${updateErr.message}`);
            errorCount++;
            continue;
          }

          result.synced++;
          errorCount = 0; // reset on success

          if (newState === "active") result.became_active++;
          else if (newState === "canceled") result.became_canceled++;
          else if (newState === "failed") result.became_failed++;

          // If became active and linked subscription has billing_type='mit', update to provider_managed
          if (newState === "active" && candidate.subscription_v2_id) {
            const { data: linkedSub } = await serviceClient
              .from("subscriptions_v2")
              .select("id, billing_type")
              .eq("id", candidate.subscription_v2_id)
              .eq("billing_type", "mit")
              .maybeSingle();

            if (linkedSub) {
              const { error: btErr } = await serviceClient
                .from("subscriptions_v2")
                .update({ billing_type: "provider_managed" })
                .eq("id", linkedSub.id);

              if (!btErr) {
                result.billing_type_updated++;
              }
            }
          }

          if (result.samples.length < 10) {
            result.samples.push({ id: sbsId, old_state: oldState, new_state: newState });
          }

        } catch (err) {
          result.errors.push(`${sbsId}: ${String(err).slice(0, 100)}`);
          errorCount++;
        }
      }

      // Small delay between batches
      if (i + params.batch_size < filtered.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    result.duration_ms = Date.now() - started;

    // Audit log
    await serviceClient.from("audit_logs").insert({
      action: "bepaid_sync_pending",
      actor_type: "system",
      actor_label: "admin-bepaid-sync-pending",
      meta: {
        triggered_by_email: user.email,
        triggered_by_id: user.id,
        dry_run: false,
        candidates_found: result.candidates_found,
        synced: result.synced,
        became_active: result.became_active,
        became_canceled: result.became_canceled,
        billing_type_updated: result.billing_type_updated,
        error_count: result.errors.length,
        mode: params.mode,
      },
    });

    return json(result);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
