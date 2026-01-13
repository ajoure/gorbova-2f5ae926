import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "orderId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load order with product/tariff info
    const { data: order, error: orderError } = await supabase
      .from("orders_v2")
      .select(`
        *,
        product:products_v2(id, name, code),
        tariff:tariffs(id, name, access_days)
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", details: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user_id exists
    if (!order.user_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          warning: "no_user_id",
          message: "Заказ без user_id. Доступ будет выдан после регистрации пользователя."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = order.user_id;
    const productId = order.product_id;
    const tariffId = order.tariff_id;
    const product = order.product as any;
    const tariff = order.tariff as any;
    
    const productCode = product?.code || (order.purchase_snapshot as any)?.product_code || "general";
    // Check if subscription by looking at tariff or product meta
    
    // Calculate access period
    const now = new Date();
    const durationDays = tariff?.access_days || 30;
    const accessEndAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const results: any = {
      orderId,
      userId,
      productCode,
      entitlement: null,
      subscription: null,
    };

    // 1. Upsert entitlement
    const { data: existingEntitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("user_id", userId)
      .eq("product_code", productCode)
      .maybeSingle();

    if (existingEntitlement) {
      // Update existing entitlement
      const { error: updateError } = await supabase
        .from("entitlements")
        .update({
          status: "active",
          expires_at: accessEndAt.toISOString(),
          order_id: orderId,
          updated_at: now.toISOString(),
        })
        .eq("id", existingEntitlement.id);

      if (updateError) {
        console.error("Error updating entitlement:", updateError);
      } else {
        results.entitlement = { action: "updated", id: existingEntitlement.id };
      }
    } else {
      // Create new entitlement
      const { data: newEntitlement, error: insertError } = await supabase
        .from("entitlements")
        .insert({
          user_id: userId,
          profile_id: userId,
          product_code: productCode,
          status: "active",
          order_id: orderId,
          expires_at: accessEndAt.toISOString(),
          meta: {
            granted_by: "grant-access-for-order",
            granted_at: now.toISOString(),
          },
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Error creating entitlement:", insertError);
      } else {
        results.entitlement = { action: "created", id: newEntitlement?.id };
      }
    }

    // 2. Check if there's an existing subscription for this order and update it
    const { data: existingSub } = await supabase
      .from("subscriptions_v2")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingSub) {
      // Update existing subscription with correct fields
      const { error: updateSubError } = await supabase
        .from("subscriptions_v2")
        .update({
          status: "active",
          access_start_at: now.toISOString(),
          access_end_at: accessEndAt.toISOString(),
          next_charge_at: accessEndAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id);

      if (updateSubError) {
        console.error("Error updating subscription:", updateSubError);
      } else {
        results.subscription = { action: "updated", id: existingSub.id };
      }
    }

    // 3. Try to grant Telegram access if applicable
    try {
      // Check if product has telegram club mapping
      const { data: clubMapping } = await supabase
        .from("product_club_mappings")
        .select("club_id")
        .eq("product_id", productId)
        .maybeSingle();

      if (clubMapping?.club_id) {
        // Call telegram-grant-access function
        const telegramResponse = await fetch(`${supabaseUrl}/functions/v1/telegram-grant-access`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId,
            clubId: clubMapping.club_id,
            orderId,
          }),
        });

        if (telegramResponse.ok) {
          const telegramResult = await telegramResponse.json();
          results.telegram = telegramResult;
        }
      }
    } catch (telegramError) {
      console.error("Telegram access error (non-critical):", telegramError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Доступы успешно выданы",
        results 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error granting access:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
