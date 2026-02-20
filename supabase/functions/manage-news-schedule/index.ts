import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify admin role via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles_v2")
      .select("role_id, roles(code)")
      .eq("user_id", user.id);

    const isAdmin = roles?.some((r: any) =>
      ["admin", "super_admin", "owner"].includes(r.roles?.code)
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { enabled, slots } = await req.json();
    console.log(`[manage-news-schedule] enabled=${enabled}, slots=${JSON.stringify(slots)}`);

    // Convert Minsk time (UTC+3) to UTC hours
    const toUtcHour = (mskTime: string): number => {
      const [h] = mskTime.split(":").map(Number);
      return (h - 3 + 24) % 24;
    };

    const morningUtc = slots && slots.length >= 1 ? toUtcHour(slots[0]) : 5;
    const afternoonUtc = slots && slots.length >= 2 ? toUtcHour(slots[1]) : 12;
    const monitorUrl = `${supabaseUrl}/functions/v1/monitor-news`;

    // Call the DB function to manage cron jobs
    const { error: cronError } = await supabase.rpc("manage_news_cron", {
      p_enabled: enabled,
      p_morning_utc_hour: morningUtc,
      p_afternoon_utc_hour: afternoonUtc,
      p_monitor_url: monitorUrl,
      p_service_key: serviceKey,
    });

    if (cronError) {
      console.error("[manage-news-schedule] Cron error:", cronError);
      throw new Error(`Failed to update cron: ${cronError.message}`);
    }

    // Update app_settings
    const { error: updateError } = await supabase
      .from("app_settings")
      .upsert({
        key: "news_auto_scrape_schedule",
        value: { enabled, slots, timezone: "Europe/Minsk" },
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

    if (updateError) {
      throw new Error(`Failed to update settings: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        enabled,
        slots,
        message: enabled
          ? `Расписание обновлено: ${slots[0]} и ${slots[1]} (Минск)`
          : "Автоматический парсинг отключён",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[manage-news-schedule] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
