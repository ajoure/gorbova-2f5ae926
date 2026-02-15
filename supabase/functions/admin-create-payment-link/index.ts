import { createClient } from 'npm:@supabase/supabase-js@2';
import { getBepaidCredsStrict, createBepaidAuthHeader, isBepaidCredsError } from '../_shared/bepaid-credentials.ts';
import { corsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface CreatePaymentLinkRequest {
  user_id: string;
  product_id: string;
  tariff_id: string;
  amount: number; // in kopecks
  payment_type: 'one_time' | 'subscription';
  description?: string;
  offer_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check - must be admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Not authorized', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return errorResponse('Invalid token', 401);
    }

    // Check admin permission
    const { data: hasPermission } = await supabase.rpc('has_permission', {
      _user_id: user.id,
      _permission_code: 'entitlements.manage',
    });

    if (!hasPermission) {
      return errorResponse('Access denied', 403);
    }

    const body: CreatePaymentLinkRequest = await req.json();
    const { user_id, product_id, tariff_id, amount, payment_type, description, offer_id } = body;

    if (!user_id || !product_id || !tariff_id || !amount) {
      return errorResponse('Missing required fields: user_id, product_id, tariff_id, amount');
    }

    if (amount < 100) {
      return errorResponse('Minimum amount is 100 kopecks (1 BYN)');
    }

    // Get bePaid credentials
    const credsResult = await getBepaidCredsStrict(supabase);
    if (isBepaidCredsError(credsResult)) {
      console.error('[create-payment-link] bePaid credentials error:', credsResult.error);
      return errorResponse(credsResult.error, 500);
    }
    const bepaidCreds = credsResult;
    const bepaidAuth = createBepaidAuthHeader(bepaidCreds);

    // Get product and tariff info
    const [productResult, tariffResult, profileResult] = await Promise.all([
      supabase.from('products_v2').select('id, name, code').eq('id', product_id).maybeSingle(),
      supabase.from('tariffs').select('id, name, code, access_days').eq('id', tariff_id).maybeSingle(),
      supabase.from('profiles').select('id, email, full_name').eq('user_id', user_id).maybeSingle(),
    ]);

    if (!productResult.data) {
      return errorResponse('Product not found', 404);
    }
    if (!tariffResult.data) {
      return errorResponse('Tariff not found', 404);
    }

    const product = productResult.data;
    const tariff = tariffResult.data;
    const profile = profileResult.data;
    const profileId = profile?.id || null;
    const customerEmail = profile?.email || 'unknown@example.com';

    const amountByn = amount / 100;
    const notificationUrl = `${supabaseUrl}/functions/v1/bepaid-webhook`;

    // Determine origin for return URL
    const reqOrigin = req.headers.get('origin');
    const reqReferer = req.headers.get('referer');
    const origin = reqOrigin || (reqReferer ? new URL(reqReferer).origin : null) || 'https://club.gorbova.by';

    if (payment_type === 'one_time') {
      // === ONE-TIME PAYMENT ===
      
      // Generate order number
      const { data: orderNumberData } = await supabase.rpc('generate_order_number');
      const orderNumber = orderNumberData || `ORD-LINK-${Date.now()}`;

      // Create pending order
      const { data: order, error: orderError } = await supabase
        .from('orders_v2')
        .insert({
          order_number: orderNumber,
          user_id,
          profile_id: profileId,
          product_id,
          tariff_id,
          offer_id: offer_id || null,
          base_price: amountByn,
          final_price: amountByn,
          paid_amount: 0,
          currency: 'BYN',
          status: 'pending',
          customer_email: customerEmail,
          meta: {
            type: 'admin_payment_link',
            description: description || null,
            created_by: user.id,
            product_name: product.name,
            tariff_name: tariff.name,
          },
        })
        .select('id')
        .single();

      if (orderError) {
        console.error('[create-payment-link] Order creation error:', orderError);
        return errorResponse('Failed to create order', 500);
      }

      const trackingId = `link:${order.id}`;
      const returnUrl = `${origin}/purchases?order=${order.id}&status=success`;

      // Create bePaid checkout
      const checkoutPayload = {
        checkout: {
          test: bepaidCreds.test_mode,
          transaction_type: 'payment',
          attempts: 3,
          settings: {
            success_url: returnUrl,
            decline_url: `${origin}/purchases?order=${order.id}&status=decline`,
            fail_url: `${origin}/purchases?order=${order.id}&status=fail`,
            notification_url: notificationUrl,
            language: 'ru',
            customer_fields: { read_only: ['email'] },
            save_card_toggle: { customer_contract: true },
          },
          order: {
            amount,
            currency: 'BYN',
            description: description || `${product.name} — ${tariff.name}`,
            tracking_id: trackingId,
            additional_data: {
              contract: ['recurring', 'card_on_file'],
              receipt: [`${product.name} — ${tariff.name}`],
            },
          },
          customer: {
            email: customerEmail,
            first_name: profile?.full_name?.split(' ')[0] || undefined,
            last_name: profile?.full_name?.split(' ').slice(1).join(' ') || undefined,
          },
        },
      };

      console.log('[create-payment-link] Creating one-time checkout:', {
        order_id: order.id,
        amount,
        product: product.name,
      });

      const checkoutResponse = await fetch('https://checkout.bepaid.by/ctp/api/checkouts', {
        method: 'POST',
        headers: {
          'Authorization': bepaidAuth,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(checkoutPayload),
      });

      const checkoutResult = await checkoutResponse.json();

      if (!checkoutResponse.ok || !checkoutResult.checkout?.redirect_url) {
        console.error('[create-payment-link] bePaid checkout error:', {
          status: checkoutResponse.status,
          result: checkoutResult,
        });
        // Clean up order
        await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
        return errorResponse(
          checkoutResult.message || checkoutResult.errors?.base?.[0] || 'bePaid checkout creation failed',
          500
        );
      }

      const redirectUrl = checkoutResult.checkout.redirect_url;

      // Update order meta with checkout token
      await supabase.from('orders_v2').update({
        meta: {
          type: 'admin_payment_link',
          description: description || null,
          created_by: user.id,
          product_name: product.name,
          tariff_name: tariff.name,
          bepaid_checkout_token: checkoutResult.checkout.token,
        },
      }).eq('id', order.id);

      // Audit log
      await supabase.from('audit_logs').insert({
        actor_type: 'admin',
        actor_user_id: user.id,
        target_user_id: user_id,
        action: 'admin.payment_link.created',
        meta: {
          payment_type: 'one_time',
          order_id: order.id,
          amount: amountByn,
          product_name: product.name,
          tariff_name: tariff.name,
        },
      });

      return jsonResponse({
        success: true,
        redirect_url: redirectUrl,
        order_id: order.id,
        order_number: orderNumber,
        payment_type: 'one_time',
      });

    } else if (payment_type === 'subscription') {
      // === SUBSCRIPTION ===

      // Generate order number
      const orderNumber = `SUB-LINK-${Date.now().toString(36).toUpperCase()}`;

      // Create pending order
      const { data: order, error: orderError } = await supabase
        .from('orders_v2')
        .insert({
          order_number: orderNumber,
          user_id,
          profile_id: profileId,
          product_id,
          tariff_id,
          offer_id: offer_id || null,
          base_price: amountByn,
          final_price: amountByn,
          paid_amount: 0,
          currency: 'BYN',
          status: 'pending',
          customer_email: customerEmail,
          meta: {
            type: 'admin_payment_link_subscription',
            description: description || null,
            created_by: user.id,
            payment_flow: 'provider_managed_checkout',
          },
        })
        .select('id')
        .single();

      if (orderError) {
        console.error('[create-payment-link] Order creation error:', orderError);
        return errorResponse('Failed to create order', 500);
      }

      const accessDays = tariff.access_days || 30;
      const intervalDays = 30;
      const trackingId = `link:order:${order.id}`;
      const successReturnUrl = `${origin}/purchases?bepaid_sub=success&order=${order.id}`;

      const planTitle = `${product.name} — ${tariff.name}`;
      const planDescription = `Подписка. Автосписание каждый месяц. Можно отменить в любой момент.`;

      // bePaid Subscriptions API
      const bepaidPayload = {
        notification_url: notificationUrl,
        return_url: successReturnUrl,
        tracking_id: trackingId,
        customer: {
          email: customerEmail,
          first_name: profile?.full_name?.split(' ')[0] || undefined,
          last_name: profile?.full_name?.split(' ').slice(1).join(' ') || undefined,
          ip: '127.0.0.1',
        },
        plan: {
          shop_id: Number(bepaidCreds.shop_id),
          currency: 'BYN',
          title: planTitle,
          description: planDescription,
          plan: {
            amount,
            interval: intervalDays,
            interval_unit: 'day',
          },
        },
        settings: {
          language: 'ru',
        },
      };

      console.log('[create-payment-link] Creating bePaid subscription:', {
        subscription_id: subscription.id,
        order_id: order.id,
        amount,
      });

      const bepaidResponse = await fetch('https://api.bepaid.by/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': bepaidAuth,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(bepaidPayload),
      });

      const bepaidResult = await bepaidResponse.json();

      if (!bepaidResponse.ok || bepaidResult.errors) {
        console.error('[create-payment-link] bePaid subscription error:', {
          status: bepaidResponse.status,
          errors: bepaidResult.errors || bepaidResult.message,
        });
        await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
        return errorResponse(
          bepaidResult.message || bepaidResult.errors?.base?.[0] || 'bePaid subscription creation failed',
          500
        );
      }

      const bepaidSubscription = bepaidResult.subscription || bepaidResult;
      const bepaidSubId = bepaidSubscription.id;
      const redirectUrl = bepaidSubscription.checkout_url || bepaidSubscription.redirect_url;

      if (!bepaidSubId || !redirectUrl) {
        console.error('[create-payment-link] No subscription ID or redirect URL in bePaid response');
        await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
        return errorResponse('bePaid did not return a subscription URL', 500);
      }

      // Store provider subscription record (subscription_id will be set after payment via grant-access-for-order)
      await supabase.from('provider_subscriptions').upsert({
        provider: 'bepaid',
        provider_subscription_id: String(bepaidSubId),
        subscription_id: null,
        user_id,
        status: 'pending',
        plan_title: planTitle,
        plan_description: planDescription,
        amount: amountByn,
        currency: 'BYN',
        interval_days: intervalDays,
        meta: {
          tracking_id: trackingId,
          checkout_url: redirectUrl,
          created_by_admin: user.id,
          order_id: order.id,
        },
      }, { onConflict: 'provider,provider_subscription_id' });

      // Audit log
      await supabase.from('audit_logs').insert({
        actor_type: 'admin',
        actor_user_id: user.id,
        target_user_id: user_id,
        action: 'admin.payment_link.created',
        meta: {
          payment_type: 'subscription',
          order_id: order.id,
          bepaid_subscription_id: bepaidSubId,
          amount: amountByn,
          product_name: product.name,
          tariff_name: tariff.name,
        },
      });

      return jsonResponse({
        success: true,
        redirect_url: redirectUrl,
        order_id: order.id,
        payment_type: 'subscription',
      });
    } else {
      return errorResponse('Invalid payment_type. Expected: one_time or subscription');
    }

  } catch (error) {
    console.error('[create-payment-link] Unexpected error:', error);
    return errorResponse('Internal server error', 500);
  }
});
