import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RevokeAccessRequest {
  user_id: string;
  club_id?: string;
  reason?: string;
  is_manual?: boolean;
}

// Telegram API helper
async function telegramRequest(botToken: string, method: string, params: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

async function kickUser(botToken: string, chatId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  // Kick without ban - user can rejoin via invite link if they get one
  const result = await telegramRequest(botToken, 'banChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
  
  if (!result.ok) {
    // User might not be in chat, that's fine
    if (result.description?.includes('user is not a member') || 
        result.description?.includes('PARTICIPANT_NOT_EXISTS')) {
      return { success: true };
    }
    return { success: false, error: result.description };
  }
  
  // Immediately unban so they can rejoin later if they pay again
  // This implements KICK_ONLY mode
  await telegramRequest(botToken, 'unbanChatMember', {
    chat_id: chatId,
    user_id: userId,
    only_if_banned: true,
  });
  
  return { success: true };
}

async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: object) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  return telegramRequest(botToken, 'sendMessage', body);
}

function getSiteUrl(): string {
  return Deno.env.get('SITE_URL') || 'https://fsby.lovable.app';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RevokeAccessRequest = await req.json();
    const { user_id, club_id, reason, is_manual } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user profile with Telegram info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (profileError || !profile || !profile.telegram_user_id) {
      return new Response(JSON.stringify({ error: 'Profile or Telegram not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access records to revoke
    let accessQuery = supabase
      .from('telegram_access')
      .select('*, telegram_clubs(*, telegram_bots(*))')
      .eq('user_id', user_id);

    if (club_id) {
      accessQuery = accessQuery.eq('club_id', club_id);
    }

    const { data: accessRecords, error: accessError } = await accessQuery;

    if (accessError || !accessRecords || accessRecords.length === 0) {
      return new Response(JSON.stringify({ error: 'No access records found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    const telegramUserId = Number(profile.telegram_user_id);

    for (const access of accessRecords) {
      const club = access.telegram_clubs;
      if (!club) continue;

      const bot = club.telegram_bots;
      if (!bot || bot.status !== 'active') {
        results.push({ club_id: club.id, error: 'Bot inactive' });
        continue;
      }

      const botToken = bot.bot_token_encrypted;
      let chatRevoked = false;
      let channelRevoked = false;

      // Revoke chat access
      if (club.chat_id && access.state_chat === 'active') {
        const kickResult = await kickUser(botToken, club.chat_id, telegramUserId);
        chatRevoked = kickResult.success;
        if (!kickResult.success) {
          console.error(`Failed to kick from chat ${club.chat_id}:`, kickResult.error);
        }
      }

      // Revoke channel access
      if (club.channel_id && access.state_channel === 'active') {
        const kickResult = await kickUser(botToken, club.channel_id, telegramUserId);
        channelRevoked = kickResult.success;
        if (!kickResult.success) {
          console.error(`Failed to kick from channel ${club.channel_id}:`, kickResult.error);
        }
      }

      // Update access record
      await supabase
        .from('telegram_access')
        .update({
          state_chat: chatRevoked ? 'revoked' : access.state_chat,
          state_channel: channelRevoked ? 'revoked' : access.state_channel,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', access.id);

      // If manual revoke, also update manual access
      if (is_manual) {
        await supabase
          .from('telegram_manual_access')
          .update({ is_active: false })
          .eq('user_id', user_id)
          .eq('club_id', club.id);
      }

      // Notify user via bot
      const keyboard = {
        inline_keyboard: [
          [{ text: '💳 Продлить подписку', url: `${getSiteUrl()}/pricing` }],
        ],
      };

      await sendMessage(
        botToken,
        telegramUserId,
        `❌ Подписка завершена\n\nСрок твоей подписки в Gorbova Club истёк, поэтому доступ к чату и каналу временно закрыт.\n\nТы можешь в любой момент вернуться — просто продли подписку 👇`,
        keyboard
      );

      // Log the action
      await supabase.from('telegram_logs').insert({
        user_id,
        club_id: club.id,
        action: is_manual ? 'MANUAL_REVOKE' : 'AUTO_REVOKE',
        target: 'both',
        status: (chatRevoked || channelRevoked) ? 'ok' : 'partial',
        meta: {
          chat_revoked: chatRevoked,
          channel_revoked: channelRevoked,
          reason: reason || 'expired',
        },
      });

      results.push({
        club_id: club.id,
        chat_revoked: chatRevoked,
        channel_revoked: channelRevoked,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Revoke access error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
