import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createPaymentCheckout } from '../_shared/create-payment-checkout.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Telegram API helper
async function telegramRequest(botToken: string, method: string, params?: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

// Escape markdown v1 special chars
function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Try to generate a checkout link for the user via the shared helper.
 * Returns { redirect_url, order_id } or null if generation failed (STOP-guard).
 */
async function tryGenerateCheckoutLink(
  supabase: any,
  userId: string,
  clubId: string,
): Promise<{ redirect_url: string; order_id: string } | null> {
  try {
    // Reverse lookup: club_id → product_id via products_v2.telegram_club_id
    const { data: product } = await supabase
      .from('products_v2')
      .select('id, name')
      .eq('telegram_club_id', clubId)
      .eq('status', 'active')
      .maybeSingle();

    if (!product) {
      console.log(`[tg-reminders] No product mapped to club ${clubId}`);
      return null;
    }

    // Find user's active/recent subscription to get tariff
    const { data: sub } = await supabase
      .from('subscriptions_v2')
      .select('tariff_id, tariffs(id, name, price, billing_type)')
      .eq('user_id', userId)
      .eq('product_id', product.id)
      .in('status', ['active', 'trial', 'past_due', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.tariff_id || !sub?.tariffs) {
      console.log(`[tg-reminders] No subscription/tariff found for user ${userId}, product ${product.id}`);
      return null;
    }

    const tariff = sub.tariffs as any;
    const amount = tariff.price ? Math.round(tariff.price * 100) : 0;

    if (!amount || amount < 100) {
      console.log(`[tg-reminders] STOP-GUARD: amount too small (${amount}) for checkout`);
      return null;
    }

    const paymentType = tariff.billing_type === 'provider_managed' ? 'subscription' : 'one_time';

    const result = await createPaymentCheckout({
      supabase,
      user_id: userId,
      product_id: product.id,
      tariff_id: tariff.id,
      amount,
      payment_type: paymentType as 'one_time' | 'subscription',
      description: 'Продление подписки (авто-напоминание)',
      origin: 'https://club.gorbova.by',
      actor_type: 'system',
    });

    if (result.success) {
      console.log(`[tg-reminders] Checkout link generated: order_id=${result.order_id}`);
      return { redirect_url: result.redirect_url, order_id: result.order_id };
    } else {
      console.error(`[tg-reminders] Checkout generation failed:`, result.error);
      return null;
    }
  } catch (err) {
    console.error(`[tg-reminders] Checkout generation error:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting subscription reminder check...');

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    // Find users whose subscription expires in 3 days (between 2 and 3 days from now)
    const { data: expiringAccess, error: queryError } = await supabase
      .from('telegram_access')
      .select(`
        id,
        user_id,
        club_id,
        active_until,
        telegram_clubs(
          club_name,
          bot_id,
          telegram_bots(bot_token_encrypted)
        )
      `)
      .or('state_chat.eq.active,state_channel.eq.active')
      .gte('active_until', twoDaysFromNow.toISOString())
      .lte('active_until', threeDaysFromNow.toISOString());

    if (queryError) {
      console.error('Failed to query expiring access:', queryError);
      throw queryError;
    }

    if (!expiringAccess || expiringAccess.length === 0) {
      console.log('No expiring subscriptions found for reminder');
      return new Response(JSON.stringify({ 
        success: true, 
        processed: 0,
        message: 'No expiring subscriptions found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${expiringAccess.length} expiring access records`);

    const results = [];
    
    for (const access of expiringAccess) {
      // Check if reminder was already sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { data: existingLog } = await supabase
        .from('telegram_logs')
        .select('id')
        .eq('user_id', access.user_id)
        .eq('action', 'reminder_sent')
        .gte('created_at', todayStart.toISOString())
        .maybeSingle();

      if (existingLog) {
        console.log(`Reminder already sent today for user ${access.user_id}`);
        results.push({
          user_id: access.user_id,
          skipped: true,
          reason: 'reminder_already_sent'
        });
        continue;
      }

      // Get user's telegram_user_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_user_id, full_name')
        .eq('user_id', access.user_id)
        .single();

      if (!profile?.telegram_user_id) {
        console.log(`User ${access.user_id} has no Telegram linked`);
        results.push({
          user_id: access.user_id,
          skipped: true,
          reason: 'no_telegram_linked'
        });
        continue;
      }

      // Check for manual access that might extend beyond
      const { data: manualAccess } = await supabase
        .from('telegram_manual_access')
        .select('*')
        .eq('user_id', access.user_id)
        .eq('club_id', access.club_id)
        .eq('is_active', true)
        .or(`valid_until.is.null,valid_until.gt.${threeDaysFromNow.toISOString()}`)
        .maybeSingle();

      if (manualAccess) {
        console.log(`User ${access.user_id} has extended manual access, skipping reminder`);
        results.push({
          user_id: access.user_id,
          skipped: true,
          reason: 'manual_access_active'
        });
        continue;
      }

      const club = access.telegram_clubs as any;
      const botToken = club?.telegram_bots?.bot_token_encrypted;
      
      if (!botToken) {
        console.log(`No bot token for club ${access.club_id}`);
        results.push({
          user_id: access.user_id,
          skipped: true,
          reason: 'no_bot_token'
        });
        continue;
      }

      // Format expiry date
      const expiryDate = new Date(access.active_until!);
      const formattedDate = expiryDate.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Try to generate a direct checkout link via shared helper
      const checkout = await tryGenerateCheckoutLink(supabase, access.user_id, access.club_id);

      // Build message text
      const clubName = club.club_name || 'клубе';
      const message = `⏰ Небольшое напоминание\n\nВаша подписка в ${clubName} заканчивается ${formattedDate}.\n\nЧтобы не потерять доступ к чату и материалам, просто продлите её заранее 💙`;

      // Build inline keyboard — always a button, never a raw URL in text
      let keyboard;
      if (checkout) {
        keyboard = {
          inline_keyboard: [[
            { text: '💳 Оплатить и продлить', url: checkout.redirect_url }
          ]]
        };
      } else {
        // Fallback: link to pricing page if checkout generation failed
        const siteUrl = Deno.env.get('SITE_URL') || 'https://club.gorbova.by';
        keyboard = {
          inline_keyboard: [[
            { text: '💳 Продлить подписку', url: `${siteUrl}/#pricing` }
          ]]
        };
      }

      const sendResult = await telegramRequest(botToken, 'sendMessage', {
        chat_id: profile.telegram_user_id,
        text: message,
        reply_markup: keyboard,
      });

      // If button send failed, try fallback with plain text link
      if (!sendResult.ok && checkout) {
        console.warn(`[tg-reminders] Inline button send failed, trying fallback text for user ${access.user_id}: ${sendResult.description}`);
        const fallbackMessage = `${message}\n\nСсылка для оплаты: ${checkout.redirect_url}`;
        const fallbackResult = await telegramRequest(botToken, 'sendMessage', {
          chat_id: profile.telegram_user_id,
          text: fallbackMessage,
        });

        // Log fallback attempt
        await supabase.from('telegram_logs').insert({
          user_id: access.user_id,
          club_id: access.club_id,
          action: 'reminder_sent',
          target: 'user',
          status: fallbackResult.ok ? 'success' : 'error',
          error_message: fallbackResult.ok ? null : fallbackResult.description,
          meta: {
            expires_at: access.active_until,
            days_until_expiry: 3,
            checkout_order_id: checkout.order_id,
            delivery_method: 'fallback_text',
            button_error: sendResult.description,
          }
        });

        results.push({
          user_id: access.user_id,
          club_id: access.club_id,
          sent: fallbackResult.ok,
          delivery: 'fallback_text',
          error: fallbackResult.ok ? null : fallbackResult.description,
        });
        continue;
      }

      // Log the reminder
      await supabase
        .from('telegram_logs')
        .insert({
          user_id: access.user_id,
          club_id: access.club_id,
          action: 'reminder_sent',
          target: 'user',
          status: sendResult.ok ? 'success' : 'error',
          error_message: sendResult.ok ? null : sendResult.description,
          meta: {
            expires_at: access.active_until,
            days_until_expiry: 3,
            checkout_order_id: checkout?.order_id || null,
            delivery_method: checkout ? 'inline_button' : 'fallback_pricing',
          }
        });

      results.push({
        user_id: access.user_id,
        club_id: access.club_id,
        sent: sendResult.ok,
        delivery: checkout ? 'inline_button' : 'fallback_pricing',
        error: sendResult.ok ? null : sendResult.description
      });
    }

    console.log('Reminder check completed');

    return new Response(JSON.stringify({ 
      success: true,
      processed: expiringAccess.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Send reminders error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
