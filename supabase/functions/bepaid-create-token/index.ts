import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateTokenRequest {
  productId: string;
  customerEmail: string;
  description?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const bepaidSecretKey = Deno.env.get('BEPAID_SECRET_KEY');
    
    if (!bepaidSecretKey) {
      console.error('BEPAID_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Payment service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    const { productId, customerEmail, description }: CreateTokenRequest = await req.json();

    if (!productId || !customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product ID and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get product details
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return new Response(
        JSON.stringify({ success: false, error: 'Product not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment settings
    const { data: settings } = await supabase
      .from('payment_settings')
      .select('key, value');

    const settingsMap: Record<string, string> = settings?.reduce((acc: Record<string, string>, s: { key: string; value: string }) => ({ ...acc, [s.key]: s.value }), {}) || {};
    const shopId = settingsMap['bepaid_shop_id'] || '14588';
    const testMode = settingsMap['bepaid_test_mode'] === 'true';
    const successUrl = settingsMap['bepaid_success_url'] || '/dashboard?payment=success';
    const failUrl = settingsMap['bepaid_fail_url'] || '/pricing?payment=failed';
    
    // Get origin from request for URLs
    const origin = req.headers.get('origin') || 'https://lovable.app';

    // Create order in database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: userId || '00000000-0000-0000-0000-000000000000',
        product_id: productId,
        amount: product.price_byn,
        currency: product.currency,
        status: 'pending',
        customer_email: customerEmail,
        customer_ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
        meta: { product_name: product.name, description }
      })
      .select()
      .single();

    if (orderError) {
      console.error('Failed to create order:', orderError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created order:', order.id);

    // Create bePaid checkout token
    const bepaidPayload = {
      checkout: {
        test: testMode,
        transaction_type: 'payment',
        attempts: 3,
        settings: {
          return_url: `${origin}${successUrl}`,
          decline_url: `${origin}${failUrl}`,
          fail_url: `${origin}${failUrl}`,
          notification_url: `${supabaseUrl}/functions/v1/bepaid-webhook`,
          language: 'ru',
          customer_fields: {
            read_only: ['email'],
          },
        },
        order: {
          amount: product.price_byn,
          currency: product.currency,
          description: description || product.name,
          tracking_id: order.id,
        },
        customer: {
          email: customerEmail,
        },
      },
    };

    console.log('Sending to bePaid:', JSON.stringify(bepaidPayload, null, 2));

    // Make request to bePaid
    const bepaidAuth = btoa(`${shopId}:${bepaidSecretKey}`);
    const bepaidResponse = await fetch('https://checkout.bepaid.by/ctp/api/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${bepaidAuth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Version': '2',
      },
      body: JSON.stringify(bepaidPayload),
    });

    const bepaidData = await bepaidResponse.json();
    console.log('bePaid response:', JSON.stringify(bepaidData, null, 2));

    if (!bepaidResponse.ok || !bepaidData.checkout?.token) {
      console.error('bePaid API error:', bepaidData);
      
      // Update order status to failed
      await supabase
        .from('orders')
        .update({ status: 'failed', error_message: bepaidData.message || 'Payment service error' })
        .eq('id', order.id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: bepaidData.message || 'Failed to create payment token' 
        }),
        { status: bepaidResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update order with token
    await supabase
      .from('orders')
      .update({ 
        bepaid_token: bepaidData.checkout.token,
        status: 'processing'
      })
      .eq('id', order.id);

    return new Response(
      JSON.stringify({
        success: true,
        token: bepaidData.checkout.token,
        redirectUrl: bepaidData.checkout.redirect_url,
        orderId: order.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating payment token:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
