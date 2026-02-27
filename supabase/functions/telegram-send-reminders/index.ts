import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateRenewalCTAs } from '../_shared/generate-renewal-ctas.ts';

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

/**
 * Resolve product + tariff + amount for a given user/club.
 * Returns null if not found or amount too small.
 */
async function resolveProductAndTariff(
  supabase: any,
  userId: string,
  clubId: string,
): Promise<{ productId: string; tariffId: string; amount: number; billingType: string; productName: string } | null> {
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
  const price = tariff.price ?? 0;

  if (price < 1) {
    console.log(`[tg-reminders] STOP-GUARD: price too small (${price}) for checkout`);
    return null;
  }

  return {
    productId: product.id,
    tariffId: tariff.id,
    amount: price, // BYN (not kopecks) — generateRenewalCTAs expects BYN
    billingType: tariff.billing_type || 'mit',
    productName: product.name,
  };
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

      // Resolve product/tariff for CTA generation
      const resolved = await resolveProductAndTariff(supabase, access.user_id, access.club_id);
      const clubName = club.club_name || 'клубе';

      // Check if user has active SBS (provider_managed) subscription
      const hasSBS = resolved?.billingType === 'provider_managed';

      // Build message text
      let message: string;
      let keyboard: any;

      if (hasSBS) {
        // SBS user — auto-renewal active, no payment links
        message = `⏰ Небольшое напоминание\n\nВаша подписка в ${clubName} продлится автоматически ${formattedDate}.\n\nАвтопродление активно — отключить его можно в личном кабинете 💙`;

        const siteUrl = Deno.env.get('SITE_URL') || 'https://club.gorbova.by';
        keyboard = {
          inline_keyboard: [[
            { text: '📋 Управление подпиской', url: `${siteUrl}/dashboard` }
          ]]
        };
      } else if (resolved) {
        // Non-SBS user — generate 2 CTA buttons via shared helper
        message = `⏰ Небольшое напоминание\n\nВаша подписка в ${clubName} заканчивается ${formattedDate}.\n\nЧтобы не потерять доступ к чату и материалам, просто продлите её заранее 💙`;

        const ctas = await generateRenewalCTAs({
          supabase,
          userId: access.user_id,
          productId: resolved.productId,
          tariffId: resolved.tariffId,
          amount: resolved.amount,
          origin: 'https://club.gorbova.by',
          actorType: 'system',
          description: 'Продление подписки (авто-напоминание TG)',
        });

        const buttons: Array<Array<{ text: string; url: string }>> = [];
        if (ctas.oneTimeUrl) {
          buttons.push([{ text: ctas.labels.oneTime, url: ctas.oneTimeUrl }]);
        }
        if (ctas.subscriptionUrl) {
          buttons.push([{ text: ctas.labels.subscription, url: ctas.subscriptionUrl }]);
        }

        if (buttons.length > 0) {
          keyboard = { inline_keyboard: buttons };
        } else {
          // Fallback: link to pricing page if both CTAs failed
          const siteUrl = Deno.env.get('SITE_URL') || 'https://club.gorbova.by';
          keyboard = {
            inline_keyboard: [[
              { text: '💳 Продлить подписку', url: `${siteUrl}/#pricing` }
            ]]
          };
        }
      } else {
        // No product/tariff resolved — generic fallback
        message = `⏰ Небольшое напоминание\n\nВаша подписка в ${clubName} заканчивается ${formattedDate}.\n\nЧтобы не потерять доступ к чату и материалам, просто продлите её заранее 💙`;

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

      // If button send failed, try fallback with plain text
      if (!sendResult.ok) {
        console.warn(`[tg-reminders] Send failed for user ${access.user_id}: ${sendResult.description}`);
        const fallbackResult = await telegramRequest(botToken, 'sendMessage', {
          chat_id: profile.telegram_user_id,
          text: message,
        });

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
            has_sbs: hasSBS,
            delivery_method: 'fallback_text',
            button_error: sendResult.description,
          }
        });

        results.push({
          user_id: access.user_id,
          club_id: access.club_id,
          sent: fallbackResult.ok,
          delivery: 'fallback_text',
          has_sbs: hasSBS,
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
          status: 'success',
          meta: {
            expires_at: access.active_until,
            days_until_expiry: 3,
            has_sbs: hasSBS,
            delivery_method: hasSBS ? 'sbs_info' : 'dual_cta_buttons',
          }
        });

      results.push({
        user_id: access.user_id,
        club_id: access.club_id,
        sent: true,
        delivery: hasSBS ? 'sbs_info' : 'dual_cta_buttons',
        has_sbs: hasSBS,
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
