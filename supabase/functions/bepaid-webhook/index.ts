import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('bePaid webhook received:', JSON.stringify(body, null, 2));

    const transaction = body.transaction;
    if (!transaction) {
      console.error('No transaction in webhook payload');
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orderId = transaction.tracking_id;
    const transactionStatus = transaction.status;
    const transactionUid = transaction.uid;
    const paymentMethod = transaction.payment_method_type;

    console.log(`Processing transaction: ${transactionUid}, status: ${transactionStatus}, order: ${orderId}`);

    if (!orderId) {
      console.error('No tracking_id (order ID) in transaction');
      return new Response(
        JSON.stringify({ error: 'Missing tracking_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderId, orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map bePaid status to our status
    let orderStatus = order.status;
    switch (transactionStatus) {
      case 'successful':
        orderStatus = 'completed';
        break;
      case 'failed':
      case 'expired':
        orderStatus = 'failed';
        break;
      case 'incomplete':
        orderStatus = 'processing';
        break;
      default:
        orderStatus = 'processing';
    }

    // Update order
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: orderStatus,
        bepaid_uid: transactionUid,
        payment_method: paymentMethod,
        error_message: transaction.message || null,
        meta: {
          ...order.meta,
          bepaid_response: transaction,
        },
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to update order:', updateError);
    }

    // If payment successful, grant entitlement
    if (orderStatus === 'completed' && order.user_id && order.user_id !== '00000000-0000-0000-0000-000000000000') {
      const product = order.products;
      
      if (product) {
        console.log(`Granting entitlement for product: ${product.name}`);

        // Calculate expiration date
        let expiresAt = null;
        if (product.duration_days) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + product.duration_days);
        }

        // Create or update entitlement
        const { error: entitlementError } = await supabase
          .from('entitlements')
          .upsert({
            user_id: order.user_id,
            product_code: product.product_type === 'subscription' ? (product.tier || 'pro') : product.id,
            status: 'active',
            expires_at: expiresAt?.toISOString() || null,
            meta: {
              order_id: orderId,
              product_name: product.name,
              bepaid_uid: transactionUid,
            },
          }, {
            onConflict: 'user_id,product_code',
          });

        if (entitlementError) {
          console.error('Failed to create entitlement:', entitlementError);
        }

        // Update subscription if it's a subscription product
        if (product.product_type === 'subscription' && product.tier) {
          const { error: subError } = await supabase
            .from('subscriptions')
            .update({
              tier: product.tier,
              is_active: true,
              starts_at: new Date().toISOString(),
              expires_at: expiresAt?.toISOString() || null,
            })
            .eq('user_id', order.user_id);

          if (subError) {
            console.error('Failed to update subscription:', subError);
          }
        }
      }

      // Log the action
      await supabase
        .from('audit_logs')
        .insert({
          action: 'payment_completed',
          actor_user_id: order.user_id,
          target_user_id: order.user_id,
          meta: {
            order_id: orderId,
            amount: order.amount,
            currency: order.currency,
            bepaid_uid: transactionUid,
          },
        });
    }

    console.log(`Order ${orderId} updated to status: ${orderStatus}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
