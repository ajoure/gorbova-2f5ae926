/**
 * Shared helper: create bePaid payment checkout (one_time or subscription)
 * 
 * Extracted from admin-create-payment-link for reuse in cron jobs (e.g. subscription-renewal-reminders).
 * This module does NOT do auth/permission checks — the caller is responsible.
 * 
 * STOP-GUARD: If product_id, tariff_id, or amount are missing/invalid — returns error, never creates orphan orders.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getBepaidCredsStrict, createBepaidAuthHeader, isBepaidCredsError } from './bepaid-credentials.ts';

export interface CreateCheckoutParams {
  supabase: ReturnType<typeof createClient>;
  user_id: string;
  product_id: string;
  tariff_id: string;
  amount: number; // kopecks
  payment_type: 'one_time' | 'subscription';
  description?: string;
  offer_id?: string;
  origin?: string;
  actor_user_id?: string;
  actor_type?: 'admin' | 'system';
}

export interface CreateCheckoutSuccess {
  success: true;
  redirect_url: string;
  order_id: string;
  order_number?: string;
  payment_type: 'one_time' | 'subscription';
}

export interface CreateCheckoutError {
  success: false;
  error: string;
}

export type CreateCheckoutResult = CreateCheckoutSuccess | CreateCheckoutError;

export async function createPaymentCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
  const {
    supabase, user_id, product_id, tariff_id, amount,
    payment_type, description, offer_id, origin, actor_user_id, actor_type,
  } = params;

  // === STOP-GUARD: validate required fields ===
  if (!user_id || !product_id || !tariff_id || !amount) {
    console.error('[create-payment-checkout] STOP-GUARD: missing required fields', {
      has_user_id: !!user_id,
      has_product_id: !!product_id,
      has_tariff_id: !!tariff_id,
      has_amount: !!amount,
    });
    return { success: false, error: 'Missing required fields: user_id, product_id, tariff_id, amount' };
  }

  if (amount < 100) {
    return { success: false, error: 'Minimum amount is 100 kopecks (1 BYN)' };
  }

  // === Get bePaid credentials ===
  const credsResult = await getBepaidCredsStrict(supabase);
  if (isBepaidCredsError(credsResult)) {
    console.error('[create-payment-checkout] bePaid credentials error:', credsResult.error);
    return { success: false, error: credsResult.error };
  }
  const bepaidCreds = credsResult;
  const bepaidAuth = createBepaidAuthHeader(bepaidCreds);

  // === Load product, tariff, profile ===
  const [productResult, tariffResult, profileResult] = await Promise.all([
    supabase.from('products_v2').select('id, name, code').eq('id', product_id).maybeSingle(),
    supabase.from('tariffs').select('id, name, code, access_days').eq('id', tariff_id).maybeSingle(),
    supabase.from('profiles').select('id, email, full_name').eq('user_id', user_id).maybeSingle(),
  ]);

  if (!productResult.data) {
    return { success: false, error: 'Product not found' };
  }
  if (!tariffResult.data) {
    return { success: false, error: 'Tariff not found' };
  }

  const product = productResult.data;
  const tariff = tariffResult.data;
  const profile = profileResult.data;
  const profileId = profile?.id || null;
  const customerEmail = profile?.email || 'unknown@example.com';

  const amountByn = amount / 100;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const notificationUrl = `${supabaseUrl}/functions/v1/bepaid-webhook`;
  const effectiveOrigin = origin || 'https://club.gorbova.by';
  const actorUserId = actor_user_id || null;
  const effectiveActorType = actor_type || 'system';

  if (payment_type === 'one_time') {
    // === ONE-TIME PAYMENT ===
    const { data: orderNumberData } = await supabase.rpc('generate_order_number');
    const orderNumber = orderNumberData || `ORD-LINK-${Date.now()}`;

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
          type: effectiveActorType === 'admin' ? 'admin_payment_link' : 'system_payment_link',
          description: description || null,
          created_by: actorUserId,
          product_name: product.name,
          tariff_name: tariff.name,
        },
      })
      .select('id')
      .single();

    if (orderError) {
      console.error('[create-payment-checkout] Order creation error:', orderError);
      return { success: false, error: 'Failed to create order' };
    }

    const trackingId = `link:${order.id}`;
    const returnUrl = `${effectiveOrigin}/purchases?order=${order.id}&status=success`;

    const checkoutPayload = {
      checkout: {
        test: bepaidCreds.test_mode,
        transaction_type: 'payment',
        attempts: 3,
        settings: {
          success_url: returnUrl,
          decline_url: `${effectiveOrigin}/purchases?order=${order.id}&status=decline`,
          fail_url: `${effectiveOrigin}/purchases?order=${order.id}&status=fail`,
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

    console.log('[create-payment-checkout] Creating one-time checkout:', {
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
      console.error('[create-payment-checkout] bePaid checkout error:', {
        status: checkoutResponse.status,
        result: checkoutResult,
      });
      await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
      return {
        success: false,
        error: checkoutResult.message || checkoutResult.errors?.base?.[0] || 'bePaid checkout creation failed',
      };
    }

    const redirectUrl = checkoutResult.checkout.redirect_url;

    // Update order meta with checkout token
    await supabase.from('orders_v2').update({
      meta: {
        type: effectiveActorType === 'admin' ? 'admin_payment_link' : 'system_payment_link',
        description: description || null,
        created_by: actorUserId,
        product_name: product.name,
        tariff_name: tariff.name,
        bepaid_checkout_token: checkoutResult.checkout.token,
      },
    }).eq('id', order.id);

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_type: effectiveActorType,
      actor_user_id: actorUserId,
      target_user_id: user_id,
      action: `${effectiveActorType}.payment_link.created`,
      meta: {
        payment_type: 'one_time',
        order_id: order.id,
        amount: amountByn,
        product_name: product.name,
        tariff_name: tariff.name,
      },
    });

    return {
      success: true,
      redirect_url: redirectUrl,
      order_id: order.id,
      order_number: orderNumber,
      payment_type: 'one_time',
    };

  } else if (payment_type === 'subscription') {
    // === SUBSCRIPTION ===
    const orderNumber = `SUB-LINK-${Date.now().toString(36).toUpperCase()}`;

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
          type: effectiveActorType === 'admin' ? 'admin_payment_link_subscription' : 'system_payment_link_subscription',
          description: description || null,
          created_by: actorUserId,
          payment_flow: 'provider_managed_checkout',
        },
      })
      .select('id')
      .single();

    if (orderError) {
      console.error('[create-payment-checkout] Order creation error:', orderError);
      return { success: false, error: 'Failed to create order' };
    }

    const accessDays = tariff.access_days || 30;
    const intervalDays = 30;
    const trackingId = `link:order:${order.id}`;
    const successReturnUrl = `${effectiveOrigin}/purchases?bepaid_sub=success&order=${order.id}`;

    const planTitle = `${product.name} — ${tariff.name}`;
    const planDescription = `Подписка. Автосписание каждый месяц. Можно отменить в любой момент.`;

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

    console.log('[create-payment-checkout] Creating bePaid subscription:', {
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
      console.error('[create-payment-checkout] bePaid subscription error:', {
        status: bepaidResponse.status,
        errors: bepaidResult.errors || bepaidResult.message,
      });
      await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
      return {
        success: false,
        error: bepaidResult.message || bepaidResult.errors?.base?.[0] || 'bePaid subscription creation failed',
      };
    }

    const bepaidSubscription = bepaidResult.subscription || bepaidResult;
    const bepaidSubId = bepaidSubscription.id;
    const redirectUrl = bepaidSubscription.checkout_url || bepaidSubscription.redirect_url;

    if (!bepaidSubId || !redirectUrl) {
      console.error('[create-payment-checkout] No subscription ID or redirect URL in bePaid response');
      await supabase.from('orders_v2').update({ status: 'failed' }).eq('id', order.id);
      return { success: false, error: 'bePaid did not return a subscription URL' };
    }

    // Store provider subscription record
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
        created_by_admin: actorUserId,
        order_id: order.id,
      },
    }, { onConflict: 'provider,provider_subscription_id' });

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_type: effectiveActorType,
      actor_user_id: actorUserId,
      target_user_id: user_id,
      action: `${effectiveActorType}.payment_link.created`,
      meta: {
        payment_type: 'subscription',
        order_id: order.id,
        bepaid_subscription_id: bepaidSubId,
        amount: amountByn,
        product_name: product.name,
        tariff_name: tariff.name,
      },
    });

    return {
      success: true,
      redirect_url: redirectUrl,
      order_id: order.id,
      payment_type: 'subscription',
    };

  } else {
    return { success: false, error: 'Invalid payment_type. Expected: one_time or subscription' };
  }
}
