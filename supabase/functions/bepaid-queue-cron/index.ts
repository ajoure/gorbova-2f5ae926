import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const maxAttempts = body.maxAttempts || 5;
    const batchSize = body.batchSize || 20;

    console.log(`[bepaid-queue-cron] Starting queue processing, batch size: ${batchSize}, max attempts: ${maxAttempts}`);

    // Get pending items with retry logic
    const { data: pendingItems, error: fetchError } = await supabase
      .from("payment_reconcile_queue")
      .select("id, bepaid_uid, customer_email, amount, currency, attempts, status")
      .in("status", ["pending", "error"])
      .lt("attempts", maxAttempts)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      console.log("[bepaid-queue-cron] No pending items to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending items" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bepaid-queue-cron] Found ${pendingItems.length} items to process`);

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process each item by calling bepaid-auto-process with queueItemId
    for (const item of pendingItems) {
      try {
        console.log(`[bepaid-queue-cron] Processing item ${item.id}, bepaid_uid=${item.bepaid_uid}`);
        
        const { data: processResult, error: processError } = await supabase.functions.invoke(
          "bepaid-auto-process",
          {
            body: { 
              queueItemId: item.id,
            },
          }
        );

        if (processError) {
          console.error(`[bepaid-queue-cron] Error processing item ${item.id}:`, processError);
          results.failed++;
          results.errors.push(`${item.id}: ${processError.message}`);
        } else if (processResult?.results?.skipped > 0) {
          results.skipped++;
        } else if (processResult?.results?.orders_created > 0) {
          results.success++;
        } else {
          results.skipped++;
        }
        
        results.processed++;
      } catch (err) {
        console.error(`[bepaid-queue-cron] Exception processing item ${item.id}:`, err);
        results.failed++;
        results.processed++;
        results.errors.push(`${item.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    console.log(`[bepaid-queue-cron] Processing complete:`, results);

    // Check for items that exceeded max attempts and need attention
    const { data: stuckItems } = await supabase
      .from("payment_reconcile_queue")
      .select("id, bepaid_uid, customer_email, amount, currency, last_error")
      .gte("attempts", maxAttempts)
      .eq("status", "error")
      .limit(10);

    if (stuckItems && stuckItems.length > 0) {
      console.log(`[bepaid-queue-cron] Found ${stuckItems.length} stuck items that need manual attention`);
      
      // Calculate total stuck amount
      const stuckAmount = stuckItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      
      // Send notification if stuck amount > 100 BYN
      if (stuckAmount > 100) {
        await supabase.functions.invoke("bepaid-discrepancy-alert", {
          body: {
            discrepancies: stuckItems.map(item => ({
              id: item.id,
              bepaid_uid: item.bepaid_uid,
              amount: item.amount,
              currency: item.currency,
              customer_email: item.customer_email,
              discrepancy_type: "stuck_items",
            })),
            threshold: 100,
            source: "queue_cron",
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        processed: results.processed,
        orders_created: results.success,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors,
        stuckItems: stuckItems?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[bepaid-queue-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
