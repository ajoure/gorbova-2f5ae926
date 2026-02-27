/**
 * PATCH RENEWAL+PAYMENTS.1 B1: Shared helper — generate 2 renewal CTA links
 * 
 * Used by: subscription-renewal-reminders, admin UI, site UI
 * Returns unified labels + URLs for one_time and subscription payment links.
 */

import { createPaymentCheckout } from './create-payment-checkout.ts';

export interface RenewalCTAs {
  oneTimeUrl: string | null;
  subscriptionUrl: string | null;
  oneTimeOrderId: string | null;
  subscriptionOrderId: string | null;
  labels: {
    oneTime: string;
    subscription: string;
  };
}

export interface GenerateRenewalCTAsParams {
  supabase: any;
  userId: string;
  productId: string;
  tariffId: string;
  amount: number; // BYN (not kopecks)
  currency?: string;
  origin?: string;
  actorType?: 'admin' | 'system';
  actorUserId?: string;
  description?: string;
}

export async function generateRenewalCTAs(params: GenerateRenewalCTAsParams): Promise<RenewalCTAs> {
  const {
    supabase, userId, productId, tariffId, amount,
    currency = 'BYN', origin = 'https://club.gorbova.by',
    actorType = 'system', actorUserId, description,
  } = params;

  const result: RenewalCTAs = {
    oneTimeUrl: null,
    subscriptionUrl: null,
    oneTimeOrderId: null,
    subscriptionOrderId: null,
    labels: {
      oneTime: '💳 Оплатить разово',
      subscription: '🔄 Подписка (автосписание)',
    },
  };

  const amountKopecks = Math.round(amount * 100);
  if (amountKopecks < 100) {
    console.log('[generate-renewal-ctas] Amount too small:', amountKopecks);
    return result;
  }

  // Generate one-time payment link
  try {
    const otResult = await createPaymentCheckout({
      supabase,
      user_id: userId,
      product_id: productId,
      tariff_id: tariffId,
      amount: amountKopecks,
      payment_type: 'one_time',
      description: description || 'Продление подписки (разовый платёж)',
      origin,
      actor_type: actorType,
      actor_user_id: actorUserId,
    });
    if (otResult.success) {
      result.oneTimeUrl = otResult.redirect_url;
      result.oneTimeOrderId = otResult.order_id;
    }
  } catch (err) {
    console.error('[generate-renewal-ctas] One-time link error:', err);
  }

  // Generate subscription payment link
  try {
    const subResult = await createPaymentCheckout({
      supabase,
      user_id: userId,
      product_id: productId,
      tariff_id: tariffId,
      amount: amountKopecks,
      payment_type: 'subscription',
      description: description || 'Подписка с автосписанием',
      origin,
      actor_type: actorType,
      actor_user_id: actorUserId,
    });
    if (subResult.success) {
      result.subscriptionUrl = subResult.redirect_url;
      result.subscriptionOrderId = subResult.order_id;
    }
  } catch (err) {
    console.error('[generate-renewal-ctas] Subscription link error:', err);
  }

  return result;
}
