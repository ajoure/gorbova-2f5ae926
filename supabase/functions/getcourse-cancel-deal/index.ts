import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


// Cancel order in GetCourse by updating existing deal status to "false" (deal_status = ложный)
// IMPORTANT: GetCourse identifies deals by deal_number, NOT deal_id!
// From docs: "При импорте сделки проверяется, существует ли сделка с указанным номером."
// The deal_number is what we pass when creating, and we MUST use the same number to update
async function cancelInGetCourse(
  email: string,
  offerId: number | string,
  orderNumber: string,
  reason: string,
  amount: number = 0,
  gcDealNumber?: number // This is the deal_number we used when creating the deal
): Promise<{ success: boolean; error?: string }> {
  const apiKey = Deno.env.get('GETCOURSE_API_KEY');
  const gcEmailRaw = Deno.env.get('GETCOURSE_EMAIL') || 'gorbova';
  
  let accountName = gcEmailRaw;
  if (gcEmailRaw.includes('getcourse.ru')) {
    const match = gcEmailRaw.match(/(?:https?:\/\/)?([^.]+)\.getcourse\.ru/);
    accountName = match ? match[1] : 'gorbova';
  }
  
  if (!apiKey) {
    console.log('[getcourse-cancel] API key not configured');
    return { success: false, error: 'API key not configured' };
  }
  
  if (!offerId) {
    console.log('[getcourse-cancel] No offerId, skipping');
    return { success: false, error: 'No offer ID' };
  }

  // CRITICAL: GetCourse identifies existing deals by deal_number, NOT deal_id!
  // From docs: "При импорте сделки проверяется, существует ли сделка с указанным номером."
  if (!gcDealNumber) {
    console.log('[getcourse-cancel] No GetCourse deal_number found - cannot update existing deal');
    return { success: false, error: 'No GetCourse deal_number - cannot update existing deal' };
  }
  
  try {
    console.log(`[getcourse-cancel] Updating deal: email=${email}, offerId=${offerId}, deal_number=${gcDealNumber}`);
    
    // To UPDATE an existing deal, we MUST use deal_number (not deal_id!)
    // GetCourse checks if deal with this number exists and updates it
    // Setting deal_status to "false" marks the payment as cancelled
    const dealParams: Record<string, any> = {
      offer_code: offerId.toString(),
      deal_number: gcDealNumber, // Use deal_number for identifying existing deal!
      deal_status: 'false', // Status "false" = "ложный" in GetCourse
      deal_cost: amount, // GetCourse requires cost even for cancellation
      deal_is_paid: 0, // Also set payment flag to unpaid
      deal_comment: `Отмена: ${reason}. Order: ${orderNumber}`,
    };
    
    const params = {
      user: { email },
      system: { 
        refresh_if_exists: 1, // Update existing deal
      },
      deal: dealParams,
    };
    
    console.log('[getcourse-cancel] Params:', JSON.stringify(params, null, 2));
    
    const formData = new URLSearchParams();
    formData.append('action', 'add');
    formData.append('key', apiKey);
    formData.append('params', btoa(unescape(encodeURIComponent(JSON.stringify(params)))));
    
    const response = await fetch(`https://${accountName}.getcourse.ru/pl/api/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    
    const responseText = await response.text();
    console.log('[getcourse-cancel] Response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { success: false, error: `Invalid response: ${responseText}` };
    }
    
    // CRITICAL: Check the inner result.result.success, not the outer result.success
    // GetCourse returns { success: true, result: { success: false, error_message: "..." } }
    // when validation fails
    if (result.result?.success === true) {
      console.log('[getcourse-cancel] Success - deal updated to status "false"');
      return { success: true };
    }
    
    // Error case - extract the error message properly
    const errorMsg = result.result?.error_message || result.error_message || JSON.stringify(result);
    console.error('[getcourse-cancel] GetCourse returned error:', errorMsg);
    return { success: false, error: errorMsg };
  } catch (error) {
    console.error('[getcourse-cancel] Error:', error);
    return { success: false, error: String(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { order_id, reason } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[getcourse-cancel] Processing order: ${order_id}`);

    // Get order with tariff data
    const { data: order, error: orderError } = await supabase
      .from('orders_v2')
      .select(`
        id, order_number, customer_email, user_id, final_price, meta,
        tariffs(id, getcourse_offer_id)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('[getcourse-cancel] Order not found:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orderMeta = (order.meta || {}) as Record<string, any>;
    const tariff = order.tariffs as any;
    
    // Get offer_id from order meta
    let gcOfferId: string | number | null = null;
    if (orderMeta.offer_id) {
      const { data: offerData } = await supabase
        .from('tariff_offers')
        .select('getcourse_offer_id')
        .eq('id', orderMeta.offer_id)
        .maybeSingle();
      
      if (offerData?.getcourse_offer_id) {
        gcOfferId = offerData.getcourse_offer_id;
      }
    }
    
    // Fallback to tariff's getcourse_offer_id
    if (!gcOfferId && tariff?.getcourse_offer_id) {
      gcOfferId = tariff.getcourse_offer_id;
    }
    
    // Get email from order or profile
    let email = order.customer_email;
    if (!email && order.user_id) {
      // profiles.id IS the user_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', order.user_id)
        .maybeSingle();
      email = profile?.email;
    }
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'No email found for order', success: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!gcOfferId) {
      return new Response(
        JSON.stringify({ error: 'No GetCourse offer ID found', success: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Get the deal_number from meta - this is what GetCourse uses to identify deals
    // From GC docs: "При импорте сделки проверяется, существует ли сделка с указанным номером"
    const gcDealNumber = orderMeta.gc_deal_number;
    
    if (!gcDealNumber) {
      console.log('[getcourse-cancel] No gc_deal_number in order meta - cannot update GetCourse');
      return new Response(
        JSON.stringify({ 
          error: 'No GetCourse deal_number stored in order (gc_deal_number)', 
          success: false,
          order_number: order.order_number,
          meta_keys: Object.keys(orderMeta),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[getcourse-cancel] Found gc_deal_number: ${gcDealNumber}`);
    
    const result = await cancelInGetCourse(
      email,
      gcOfferId,
      order.order_number,
      reason || 'deal_deleted',
      order.final_price || 0,
      gcDealNumber // Pass the deal_number for identifying the deal
    );

    console.log('[getcourse-cancel] Result:', result);

    return new Response(
      JSON.stringify({ 
        success: result.success, 
        error: result.error,
        order_number: order.order_number,
        email: email,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[getcourse-cancel] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
