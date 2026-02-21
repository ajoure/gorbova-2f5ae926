import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createPaymentCheckout } from '../_shared/create-payment-checkout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PATCH 1-2: Enhanced types with skip/fail separation and error_stage
interface ReminderResult {
  user_id: string;
  subscription_id: string;
  order_id: string | null;
  tariff_id: string | null;
  days_until_expiry: number;
  telegram_sent: boolean;
  telegram_logged: boolean;
  telegram_log_error: string | null;
  email_sent: boolean;
  error?: string;
  reminder_type?: string;
  skip_reason?: 'no_telegram_linked' | 'no_link_bot_configured' | null;
  fail_reason?: 'send_failed' | 'log_insert_failed' | null;
  error_stage?: 'load_profile' | 'send_api' | 'insert_log' | null;
  telegram_api_error?: string | null;
  duplicate_suppressed?: boolean;
}

// Format currency
function formatCurrency(amount: number, currency: string = 'BYN'): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function getDaysWord(days: number): string {
  if (days === 1) return 'день';
  if (days >= 2 && days <= 4) return 'дня';
  return 'дней';
}

/**
 * Check if user has an active provider-managed (SBS) subscription for a given product.
 */
async function hasActiveSBS(supabase: any, userId: string, productId: string | null): Promise<boolean> {
  if (!productId) return false;
  
  // Check provider_subscriptions for active bePaid subscription linked to this user
  const { data } = await supabase
    .from('provider_subscriptions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'pending']) // pending = just created, waiting for first payment
    .limit(10);
  
  if (!data || data.length === 0) return false;
  
  // Any active provider subscription for this user counts
  // (We can't easily filter by product_id in provider_subscriptions, but having any active SBS means bePaid handles renewal)
  return data.some((ps: any) => ps.status === 'active');
}

/**
 * Try to generate a payment link for renewal via shared helper.
 * Returns redirect_url or null if generation failed (STOP-guard).
 */
async function tryGeneratePaymentLink(
  supabase: any,
  userId: string,
  productId: string | null,
  tariffId: string | null,
  amount: number, // BYN (not kopecks)
  currency: string
): Promise<string | null> {
  // STOP-GUARD: all fields must be present
  if (!productId || !tariffId || !amount || amount <= 0) {
    console.log('[reminders] STOP-GUARD: cannot generate payment link, missing data', {
      has_product_id: !!productId,
      has_tariff_id: !!tariffId,
      amount,
    });
    return null;
  }

  try {
    const amountKopecks = Math.round(amount * 100);
    if (amountKopecks < 100) {
      console.log('[reminders] STOP-GUARD: amount too small for payment link:', amountKopecks);
      return null;
    }

    const result = await createPaymentCheckout({
      supabase,
      user_id: userId,
      product_id: productId,
      tariff_id: tariffId,
      amount: amountKopecks,
      payment_type: 'one_time', // renewal link is one-time payment
      description: 'Продление подписки',
      origin: 'https://club.gorbova.by',
      actor_type: 'system',
    });

    if (result.success) {
      console.log('[reminders] Payment link generated:', { order_id: result.order_id });
      return result.redirect_url;
    } else {
      console.error('[reminders] Payment link generation failed:', result.error);
      return null;
    }
  } catch (err) {
    console.error('[reminders] Payment link generation error:', err);
    return null;
  }
}

// Send Telegram reminder — unified texts without hasCard/!hasCard split
async function sendTelegramReminder(
  supabase: any,
  botToken: string | null,
  userId: string,
  productName: string,
  tariffName: string,
  expiryDate: Date,
  daysLeft: number,
  amount: number,
  currency: string,
  hasSBS: boolean,
  paymentLinkUrl: string | null,
  subscriptionId: string,
  orderId: string | null,
  tariffId: string | null
): Promise<{ 
  sent: boolean; 
  logged: boolean; 
  logError: string | null;
  skipReason?: 'no_telegram_linked' | 'no_link_bot_configured' | null;
  failReason?: 'send_failed' | 'log_insert_failed' | null;
  errorStage?: 'load_profile' | 'send_api' | 'insert_log' | null;
  telegramApiError?: string | null;
  duplicateSuppressed?: boolean;
}> {
  let sent = false;
  let logged = false;
  let logError: string | null = null;
  let message = '';

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_user_id, telegram_link_status, full_name')
      .eq('user_id', userId)
      .single();

    // SKIP - No Telegram linked
    if (!profile?.telegram_user_id || profile.telegram_link_status !== 'active') {
      const { error: skipLogError } = await supabase.from('telegram_logs').insert({
        action: 'SEND_REMINDER',
        event_type: `subscription_reminder_${daysLeft}d`,
        user_id: userId,
        status: 'skipped',
        message_text: null,
        error_message: null,
        meta: {
          reason: 'no_telegram_linked',
          message_template_key: `reminder_${daysLeft}d`,
          subscription_id: subscriptionId,
          order_id: orderId,
          tariff_id: tariffId,
          days_left: daysLeft,
        },
      });
      const isDuplicate = skipLogError?.code === '23505';
      return { 
        sent: false, logged: !skipLogError || isDuplicate,
        logError: (skipLogError && !isDuplicate) ? skipLogError.message : null,
        skipReason: 'no_telegram_linked', failReason: null, errorStage: 'load_profile',
        duplicateSuppressed: isDuplicate,
      };
    }

    // SKIP - No bot configured
    if (!botToken) {
      const { error: skipLogError } = await supabase.from('telegram_logs').insert({
        action: 'SEND_REMINDER',
        event_type: `subscription_reminder_${daysLeft}d`,
        user_id: userId,
        status: 'skipped',
        message_text: null,
        error_message: null,
        meta: {
          reason: 'no_link_bot_configured',
          message_template_key: `reminder_${daysLeft}d`,
          subscription_id: subscriptionId,
          order_id: orderId,
          tariff_id: tariffId,
          days_left: daysLeft,
        },
      });
      const isDuplicate = skipLogError?.code === '23505';
      return { 
        sent: false, logged: !skipLogError || isDuplicate,
        logError: (skipLogError && !isDuplicate) ? skipLogError.message : null,
        skipReason: 'no_link_bot_configured', failReason: null, errorStage: null,
        duplicateSuppressed: isDuplicate,
      };
    }

    const userName = profile.full_name?.split(' ')[0] || 'Клиент';
    const formattedDate = expiryDate.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'long' 
    });

    // Unified texts: SBS vs !SBS (no hasCard/!hasCard)
    const ctaUrl = hasSBS 
      ? 'https://club.gorbova.by/purchases' 
      : (paymentLinkUrl || 'https://club.gorbova.by/purchases');
    const ctaText = hasSBS ? 'Управление подпиской' : 'Оплатить и продлить';
    
    if (daysLeft === 7) {
      if (hasSBS) {
        message = `📅 *Напоминание о подписке*

${userName}, ваша подписка на *${productName}* заканчивается через неделю (${formattedDate}).

Автопродление активно — подписка продлится автоматически.

🔗 [${ctaText}](${ctaUrl})`;
      } else {
        message = `📅 *Напоминание о подписке*

${userName}, ваша подписка на *${productName}* заканчивается через неделю (${formattedDate}).

📦 *Продукт:* ${productName}
🎯 *Тариф:* ${tariffName}

Для продления оплатите по ссылке.

🔗 [${ctaText}](${ctaUrl})`;
      }
    } else if (daysLeft === 3) {
      if (hasSBS) {
        message = `⏰ *Подписка заканчивается через 3 дня*

${userName}, осталось 3 дня до окончания подписки на *${productName}* (${formattedDate}).

Автопродление активно.

🔗 [${ctaText}](${ctaUrl})`;
      } else {
        message = `⏰ *Подписка заканчивается через 3 дня*

${userName}, осталось 3 дня до окончания подписки на *${productName}* (${formattedDate}).

📦 *${productName}* / ${tariffName}

Для продления оплатите по ссылке.

🔗 [${ctaText}](${ctaUrl})`;
      }
    } else if (daysLeft === 1) {
      if (hasSBS) {
        message = `🔔 *Завтра заканчивается подписка!*

${userName}, это последнее напоминание. Подписка продлится автоматически.

🔗 [${ctaText}](${ctaUrl})`;
      } else {
        message = `🔔 *Завтра заканчивается подписка!*

${userName}, это последнее напоминание. Подписка на *${productName}* заканчивается ${formattedDate}.

Оплатите сейчас, чтобы сохранить доступ.

🔗 [${ctaText}](${ctaUrl})`;
      }
    }

    if (!message) return { sent: false, logged: false, logError: 'Invalid daysLeft', skipReason: null, failReason: null };

    // Build reply_markup for inline button (only for !SBS with real payment link)
    const replyMarkup = (!hasSBS && paymentLinkUrl) ? {
      inline_keyboard: [[{ text: '💳 Оплатить и продлить', url: paymentLinkUrl }]]
    } : undefined;

    // Send Telegram message
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: profile.telegram_user_id,
        text: message,
        parse_mode: 'Markdown',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    const result = await response.json();
    sent = result.ok === true;

    // FAIL - Telegram API error
    if (!sent) {
      const telegramError = result.description || `HTTP ${response.status}`;
      const { error: failLogError } = await supabase.from('telegram_logs').insert({
        action: 'SEND_REMINDER',
        event_type: `subscription_reminder_${daysLeft}d`,
        user_id: userId,
        status: 'failed',
        error_message: telegramError,
        message_text: message,
        meta: {
          subscription_id: subscriptionId, order_id: orderId, tariff_id: tariffId,
          days_left: daysLeft, has_sbs: hasSBS, has_payment_link: !!paymentLinkUrl,
          telegram_error_code: result.error_code, telegram_response: result,
        },
      });
      const isDuplicate = failLogError?.code === '23505';
      return {
        sent: false, logged: !failLogError || isDuplicate,
        logError: (failLogError && !isDuplicate) ? failLogError.message : null,
        skipReason: null, failReason: 'send_failed', errorStage: 'send_api',
        telegramApiError: telegramError, duplicateSuppressed: isDuplicate,
      };
    }

    // SUCCESS - Log
    const { error: insertError } = await supabase.from('telegram_logs').insert({
      action: 'SEND_REMINDER',
      event_type: `subscription_reminder_${daysLeft}d`,
      user_id: userId,
      status: 'success',
      message_text: message,
      meta: {
        days_left: daysLeft, product: productName, tariff: tariffName,
        subscription_id: subscriptionId, order_id: orderId, tariff_id: tariffId,
        has_sbs: hasSBS, has_payment_link: !!paymentLinkUrl,
      },
    });
    const isDuplicate = insertError?.code === '23505';
    if (insertError && !isDuplicate) {
      logError = insertError.message;
      console.error('Failed to log telegram reminder:', insertError);
      return { sent: true, logged: false, logError, skipReason: null, failReason: 'log_insert_failed', errorStage: 'insert_log' };
    } else {
      logged = true;
    }

    return { sent, logged, logError: null, skipReason: null, failReason: null, duplicateSuppressed: isDuplicate };
  } catch (err) {
    console.error('Failed to send Telegram reminder:', err);
    return { sent: false, logged: false, logError: err instanceof Error ? err.message : 'Unknown error', skipReason: null, failReason: 'send_failed', errorStage: 'send_api' };
  }
}

// Send email reminder — unified without hasCard/!hasCard
async function sendEmailReminder(
  supabase: any,
  userId: string,
  profileId: string | null,
  email: string,
  productName: string,
  tariffName: string,
  expiryDate: Date,
  daysLeft: number,
  amount: number,
  currency: string,
  hasSBS: boolean,
  paymentLinkUrl: string | null,
  subscriptionId: string,
  orderId: string | null,
  tariffId: string | null
): Promise<boolean> {
  try {
    const formattedDate = expiryDate.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'long',
      year: 'numeric'
    });

    let subject = '';
    let bodyHtml = '';

    const ctaUrl = hasSBS
      ? 'https://club.gorbova.by/purchases'
      : (paymentLinkUrl || 'https://club.gorbova.by/purchases');
    const ctaText = hasSBS ? 'Управление подпиской' : 'Оплатить и продлить';

    const statusSection = hasSBS 
      ? `<p style="color: #059669; margin: 16px 0;">✅ Автопродление активно. Подписка продлится автоматически.</p>`
      : `<div style="background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #0c4a6e;">Для продления оплатите по ссылке ниже.</p>
        </div>`;

    if (daysLeft === 7) {
      subject = '📅 Напоминание: подписка заканчивается через неделю';
      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 20px;">Напоминание о подписке</h1>
          <p>Здравствуйте!</p>
          <p>Ваша подписка заканчивается через <strong>7 дней</strong>.</p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>📦 Продукт:</strong> ${productName}</p>
            <p style="margin: 0 0 8px 0;"><strong>🎯 Тариф:</strong> ${tariffName}</p>
            <p style="margin: 0;"><strong>📆 Дата окончания:</strong> ${formattedDate}</p>
          </div>
          ${statusSection}
          <p style="margin-top: 24px;">
            <a href="${ctaUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              ${ctaText}
            </a>
          </p>
          <p style="color: #6b7280; margin-top: 32px; font-size: 14px;">С уважением,<br>Команда клуба</p>
        </div>`;
    } else if (daysLeft === 3) {
      subject = '⏰ Подписка заканчивается через 3 дня';
      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1f2937; font-size: 24px; margin-bottom: 20px;">Осталось 3 дня</h1>
          <p>Здравствуйте!</p>
          <p>До окончания вашей подписки осталось <strong>3 дня</strong>.</p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>📦 Продукт:</strong> ${productName}</p>
            <p style="margin: 0 0 8px 0;"><strong>🎯 Тариф:</strong> ${tariffName}</p>
            <p style="margin: 0;"><strong>📆 Дата окончания:</strong> ${formattedDate}</p>
          </div>
          ${statusSection}
          <p style="margin-top: 24px;">
            <a href="${ctaUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              ${ctaText}
            </a>
          </p>
          <p style="color: #6b7280; margin-top: 32px; font-size: 14px;">С уважением,<br>Команда клуба</p>
        </div>`;
    } else if (daysLeft === 1) {
      subject = '🔔 Завтра заканчивается подписка!';
      bodyHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 20px;">Последнее напоминание!</h1>
          <p>Здравствуйте!</p>
          <p>Ваша подписка заканчивается <strong>завтра</strong>.</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>📦 Продукт:</strong> ${productName}</p>
            <p style="margin: 0 0 8px 0;"><strong>🎯 Тариф:</strong> ${tariffName}</p>
            <p style="margin: 0;"><strong>📆 Дата окончания:</strong> ${formattedDate}</p>
          </div>
          ${statusSection}
          <p style="margin-top: 24px;">
            <a href="${ctaUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
              ${ctaText}
            </a>
          </p>
          <p style="color: #6b7280; margin-top: 32px; font-size: 14px;">С уважением,<br>Команда клуба</p>
        </div>`;
    }

    if (!subject) return false;

    const eventType = `subscription_reminder_${daysLeft}d`;
    
    const emailPayload = {
      to: email,
      subject,
      html: bodyHtml,
      context: {
        user_id: userId,
        profile_id: profileId,
        subscription_id: subscriptionId,
        event_type: eventType,
        meta: {
          days_left: daysLeft,
          has_sbs: hasSBS,
          has_payment_link: !!paymentLinkUrl,
          source: 'subscription-renewal-reminders',
          order_id: orderId,
          tariff_id: tariffId,
        }
      }
    };
    
    console.log('[reminders] send-email payload:', JSON.stringify({
      to: email,
      'context.user_id': userId,
      'context.profile_id': profileId,
      'context.subscription_id': subscriptionId,
      'context.event_type': eventType,
    }));

    const { error } = await supabase.functions.invoke('send-email', {
      body: emailPayload,
    });

    if (error) {
      console.error('Email send error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to send email reminder:', err);
    return false;
  }
}

// Check if reminder was already sent today
async function wasReminderSentToday(
  supabase: any,
  userId: string,
  eventType: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('telegram_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .gte('created_at', today.toISOString())
    .limit(1);

  return (data?.length || 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const source = body.source || 'manual';

    console.log(`Starting subscription renewal reminders job... Source: ${source}`);

    const now = new Date();
    const results: ReminderResult[] = [];

    // Load link bot ONCE at start of run
    const { data: linkBot, error: botError } = await supabase
      .from('telegram_bots')
      .select('id, bot_username, bot_name, status, is_primary, bot_token_encrypted')
      .eq('is_primary', true)
      .eq('status', 'active')
      .limit(1)
      .single();

    const botToken = linkBot?.bot_token_encrypted ?? null;
    const linkBotMissing = !botToken;

    console.log(`Link bot status: ${linkBotMissing ? 'NOT FOUND' : `@${linkBot?.bot_username}`}`);

    if (linkBotMissing) {
      await supabase.from('audit_logs').insert({
        action: 'telegram.bot_config_missing',
        actor_type: 'system',
        actor_user_id: null,
        actor_label: 'subscription-renewal-reminders',
        meta: {
          run_at: now.toISOString(), source,
          query: 'is_primary=true AND status=active',
          hint: 'Check telegram_bots table: need is_primary=true AND status=active',
          bot_error: botError?.message || null,
        },
      });
    }

    // ============ STANDARD REMINDERS (7, 3, 1 days by access_end_at) ============
    for (const daysLeft of [7, 3, 1]) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysLeft);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      console.log(`Checking subscriptions expiring in ${daysLeft} days (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);

      const { data: subscriptions, error } = await supabase
        .from('subscriptions_v2')
        .select(`
          id,
          user_id,
          order_id,
          access_end_at,
          payment_token,
          tariff_id,
          payment_method_id,
          tariffs (
            id,
            name,
            product_id,
            products_v2 (
              id,
              name
            )
          )
        `)
        .in('status', ['active', 'trial'])
        .gte('access_end_at', startOfDay.toISOString())
        .lte('access_end_at', endOfDay.toISOString())
        .eq('auto_renew', true);

      if (error) {
        console.error(`Query error for ${daysLeft} days:`, error);
        continue;
      }

      console.log(`Found ${subscriptions?.length || 0} subscriptions expiring in ${daysLeft} days`);

      for (const sub of subscriptions || []) {
        const userId = sub.user_id;
        
        if (await wasReminderSentToday(supabase, userId, `subscription_reminder_${daysLeft}d`)) {
          console.log(`Reminder already sent today for user ${userId}, skipping`);
          continue;
        }

        // Get user profile and email
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('user_id', userId)
          .single();

        let userEmail = profile?.email;
        if (!userEmail) {
          const { data: authUser } = await supabase.auth.admin.getUserById(userId);
          userEmail = authUser?.user?.email;
        }

        // Get tariff price
        let amount = 0;
        let currency = 'BYN';
        if (sub.tariff_id) {
          const { data: priceData } = await supabase
            .from('tariff_prices')
            .select('final_price, price, currency')
            .eq('tariff_id', sub.tariff_id)
            .eq('is_active', true)
            .limit(1)
            .single();
          
          if (priceData) {
            amount = priceData.final_price || priceData.price || 0;
            currency = priceData.currency || 'BYN';
          }
        }

        const tariff = sub.tariffs as any;
        const product = tariff?.products_v2 as any;
        const productId = product?.id || tariff?.product_id || null;
        const productName = product?.name || 'Подписка';
        const tariffName = tariff?.name || 'Стандартный';
        const expiryDate = new Date(sub.access_end_at);

        // Check if user has active SBS for this product
        const userHasSBS = await hasActiveSBS(supabase, userId, productId);

        // If no SBS, try to generate payment link
        let paymentLinkUrl: string | null = null;
        if (!userHasSBS) {
          paymentLinkUrl = await tryGeneratePaymentLink(
            supabase, userId, productId, sub.tariff_id, amount, currency
          );
        }

        const result: ReminderResult = {
          user_id: userId,
          subscription_id: sub.id,
          order_id: sub.order_id,
          tariff_id: sub.tariff_id,
          days_until_expiry: daysLeft,
          telegram_sent: false,
          telegram_logged: false,
          telegram_log_error: null,
          email_sent: false,
          reminder_type: 'expiry_reminder',
        };

        // Send Telegram reminder
        const telegramResult = await sendTelegramReminder(
          supabase, botToken, userId,
          productName, tariffName, expiryDate, daysLeft,
          amount, currency, userHasSBS, paymentLinkUrl,
          sub.id, sub.order_id, sub.tariff_id
        );

        result.telegram_sent = telegramResult.sent;
        result.telegram_logged = telegramResult.logged;
        result.telegram_log_error = telegramResult.logError;
        result.skip_reason = telegramResult.skipReason;
        result.fail_reason = telegramResult.failReason;
        result.error_stage = telegramResult.errorStage;
        result.telegram_api_error = telegramResult.telegramApiError;
        result.duplicate_suppressed = telegramResult.duplicateSuppressed;

        // Send email reminder
        if (userEmail) {
          result.email_sent = await sendEmailReminder(
            supabase, userId, profile?.id || null, userEmail,
            productName, tariffName, expiryDate, daysLeft,
            amount, currency, userHasSBS, paymentLinkUrl,
            sub.id, sub.order_id, sub.tariff_id
          );
        }

        results.push(result);
        console.log(`Processed reminder for user ${userId}: TG sent=${result.telegram_sent}, SBS=${userHasSBS}, paymentLink=${!!paymentLinkUrl}, Email=${result.email_sent}`);
      }
    }

    // ============ EXPIRING WITHOUT SBS (replaces old NO-CARD WARNING) ============
    // Instead of warning about missing cards, we now check for missing SBS and send payment links
    console.log('Checking for expiring subscriptions without SBS...');
    
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: expiringSubs } = await supabase
      .from('subscriptions_v2')
      .select(`
        id,
        user_id,
        order_id,
        access_end_at,
        tariff_id,
        tariffs (
          id,
          name,
          product_id,
          products_v2 (id, name)
        )
      `)
      .eq('auto_renew', true)
      .in('status', ['active', 'trial'])
      .lte('access_end_at', sevenDaysFromNow.toISOString())
      .gte('access_end_at', now.toISOString())
      .limit(100);

    console.log(`Found ${expiringSubs?.length || 0} subscriptions expiring within 7 days for SBS check`);

    for (const sub of expiringSubs || []) {
      const userId = sub.user_id;

      // Check if already sent today (reuse event type for backward compat)
      if (await wasReminderSentToday(supabase, userId, 'subscription_no_card_warning')) {
        continue;
      }

      const tariff = sub.tariffs as any;
      const product = tariff?.products_v2 as any;
      const productId = product?.id || tariff?.product_id || null;
      const productName = product?.name || tariff?.name || 'Подписка';

      const accessEndAt = new Date(sub.access_end_at);
      const daysLeft = Math.ceil((accessEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const noCardReminderDays = [7, 3, 1];
      if (!noCardReminderDays.includes(daysLeft)) continue;

      // Only send if user does NOT have active SBS
      const userHasSBS = await hasActiveSBS(supabase, userId, productId);
      if (userHasSBS) {
        console.log(`User ${userId} has active SBS, skipping expiring-without-SBS warning`);
        continue;
      }

      // Get tariff price for payment link
      let amount = 0;
      let currency = 'BYN';
      if (sub.tariff_id) {
        const { data: priceData } = await supabase
          .from('tariff_prices')
          .select('final_price, price, currency')
          .eq('tariff_id', sub.tariff_id)
          .eq('is_active', true)
          .limit(1)
          .single();
        if (priceData) {
          amount = priceData.final_price || priceData.price || 0;
          currency = priceData.currency || 'BYN';
        }
      }

      // Generate payment link
      const paymentLinkUrl = await tryGeneratePaymentLink(
        supabase, userId, productId, sub.tariff_id, amount, currency
      );

      // Send via the unified sendTelegramReminder (with hasSBS=false)
      const telegramResult = await sendTelegramReminder(
        supabase, botToken, userId,
        productName, tariff?.name || 'Стандартный',
        accessEndAt, daysLeft, amount, currency,
        false, paymentLinkUrl,
        sub.id, sub.order_id, sub.tariff_id
      );

      results.push({
        user_id: userId,
        subscription_id: sub.id,
        order_id: sub.order_id,
        tariff_id: sub.tariff_id,
        days_until_expiry: daysLeft,
        telegram_sent: telegramResult.sent,
        telegram_logged: telegramResult.logged,
        telegram_log_error: telegramResult.logError,
        email_sent: false,
        reminder_type: 'no_card_warning', // keep for backward compat in stats
        skip_reason: telegramResult.skipReason,
        fail_reason: telegramResult.failReason,
        error_stage: telegramResult.errorStage,
        telegram_api_error: telegramResult.telegramApiError,
        duplicate_suppressed: telegramResult.duplicateSuppressed,
      });

      console.log(`Expiring-without-SBS for user ${userId}: sent=${telegramResult.sent}, paymentLink=${!!paymentLinkUrl}`);
    }

    // ============ Statistics ============
    const reminders7d = results.filter(r => r.days_until_expiry === 7 && r.reminder_type === 'expiry_reminder');
    const reminders3d = results.filter(r => r.days_until_expiry === 3 && r.reminder_type === 'expiry_reminder');
    const reminders1d = results.filter(r => r.days_until_expiry === 1 && r.reminder_type === 'expiry_reminder');
    const noCardWarnings = results.filter(r => r.reminder_type === 'no_card_warning');

    const skippedNoTelegram = results.filter(r => r.skip_reason === 'no_telegram_linked');
    const skippedNoBot = results.filter(r => r.skip_reason === 'no_link_bot_configured');
    const failedSend = results.filter(r => r.fail_reason === 'send_failed');
    const failedLogInsert = results.filter(r => r.fail_reason === 'log_insert_failed');
    const duplicateSuppressed = results.filter(r => r.duplicate_suppressed);

    const summary = {
      source,
      run_at: now.toISOString(),
      link_bot_available: !linkBotMissing,
      total: results.length,
      expiry_reminders: results.filter(r => r.reminder_type === 'expiry_reminder').length,
      no_card_warnings: noCardWarnings.length,
      telegram_sent: results.filter(r => r.telegram_sent).length,
      telegram_logged: results.filter(r => r.telegram_logged).length,
      telegram_log_failed: results.filter(r => r.telegram_log_error).length,
      email_sent: results.filter(r => r.email_sent).length,
      skipped_no_telegram_linked: skippedNoTelegram.length,
      skipped_no_link_bot: skippedNoBot.length,
      failed_send: failedSend.length,
      failed_log_insert: failedLogInsert.length,
      duplicate_suppressed: duplicateSuppressed.length,
    };

    await supabase.from('audit_logs').insert({
      action: 'subscription.reminders_cron_completed',
      actor_type: 'system',
      actor_user_id: null,
      actor_label: 'subscription-renewal-reminders',
      meta: {
        source,
        run_at: now.toISOString(),
        link_bot_available: !linkBotMissing,
        total_processed: results.length,
        reminders_7d_sent: reminders7d.filter(r => r.telegram_sent).length,
        reminders_3d_sent: reminders3d.filter(r => r.telegram_sent).length,
        reminders_1d_sent: reminders1d.filter(r => r.telegram_sent).length,
        no_card_warnings_sent: noCardWarnings.filter(r => r.telegram_sent).length,
        expiry_reminders_sent: results.filter(r => r.reminder_type === 'expiry_reminder' && r.telegram_sent).length,
        telegram_sent_count: results.filter(r => r.telegram_sent).length,
        telegram_logged_count: results.filter(r => r.telegram_logged).length,
        skipped_no_telegram_linked_count: skippedNoTelegram.length,
        skipped_no_link_bot_count: skippedNoBot.length,
        failed_send_count: failedSend.length,
        failed_log_insert_count: failedLogInsert.length,
        duplicate_suppressed_count: duplicateSuppressed.length,
        skip_samples: [...skippedNoTelegram, ...skippedNoBot]
          .slice(0, 10)
          .map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id, reason: r.skip_reason })),
        fail_samples: [...failedSend, ...failedLogInsert]
          .slice(0, 20)
          .map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id, reason: r.fail_reason, stage: r.error_stage, error: r.telegram_api_error || r.telegram_log_error })),
        duplicate_samples: duplicateSuppressed.length > 0 
          ? duplicateSuppressed.slice(0, 10).map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id }))
          : undefined,
        recipients_7d: reminders7d.filter(r => r.telegram_sent).slice(0, 50).map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id })),
        recipients_3d: reminders3d.filter(r => r.telegram_sent).slice(0, 50).map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id })),
        recipients_1d: reminders1d.filter(r => r.telegram_sent).slice(0, 50).map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id })),
        no_card_recipients: noCardWarnings.filter(r => r.telegram_sent).slice(0, 50).map(r => ({ user_id: r.user_id, subscription_id: r.subscription_id })),
      }
    });

    console.log('Subscription renewal reminders job completed:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Subscription renewal reminders error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
