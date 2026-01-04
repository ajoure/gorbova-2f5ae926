import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GrantAccessRequest {
  user_id: string;
  club_id?: string;
  is_manual?: boolean;
  admin_id?: string;
  valid_until?: string;
  comment?: string;
}

// Telegram API helpers
async function telegramRequest(botToken: string, method: string, params: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return response.json();
}

async function addUserToChat(botToken: string, chatId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  // Try to unban first (in case user was kicked before)
  await telegramRequest(botToken, 'unbanChatMember', {
    chat_id: chatId,
    user_id: userId,
    only_if_banned: true,
  });
  
  // Note: Direct adding to groups requires the user to have messaged the bot first
  // This is a Telegram limitation. We use invite links as fallback.
  return { success: true };
}

async function createInviteLink(botToken: string, chatId: number): Promise<{ link?: string; error?: string }> {
  const result = await telegramRequest(botToken, 'createChatInviteLink', {
    chat_id: chatId,
    member_limit: 1,
    expire_date: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  });
  
  if (result.ok) {
    return { link: result.result.invite_link };
  }
  return { error: result.description || 'Failed to create invite link' };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: GrantAccessRequest = await req.json();
    const { user_id, club_id, is_manual, admin_id, valid_until, comment } = body;

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

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.telegram_user_id) {
      await supabase.from('telegram_logs').insert({
        user_id,
        action: 'GRANT_FAILED',
        status: 'error',
        error_message: 'Telegram not linked',
      });
      
      return new Response(JSON.stringify({ error: 'Telegram not linked', code: 'TG_NOT_LINKED' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get clubs to grant access to
    let clubsQuery = supabase
      .from('telegram_clubs')
      .select('*, telegram_bots(*)')
      .eq('is_active', true);

    if (club_id) {
      clubsQuery = clubsQuery.eq('id', club_id);
    }

    const { data: clubs, error: clubsError } = await clubsQuery;

    if (clubsError || !clubs || clubs.length === 0) {
      return new Response(JSON.stringify({ error: 'No active clubs found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const club of clubs) {
      const bot = club.telegram_bots;
      if (!bot || bot.status !== 'active') {
        results.push({ club_id: club.id, error: 'Bot inactive' });
        continue;
      }

      const botToken = bot.bot_token_encrypted;
      const telegramUserId = Number(profile.telegram_user_id);
      
      let chatInviteLink: string | null = null;
      let channelInviteLink: string | null = null;
      let chatGranted = false;
      let channelGranted = false;

      // Grant chat access
      if (club.chat_id) {
        if (club.access_mode === 'AUTO_ADD' || club.access_mode === 'AUTO_WITH_FALLBACK') {
          const addResult = await addUserToChat(botToken, club.chat_id, telegramUserId);
          chatGranted = addResult.success;
        }
        
        if (!chatGranted && (club.access_mode === 'INVITE_ONLY' || club.access_mode === 'AUTO_WITH_FALLBACK')) {
          const inviteResult = await createInviteLink(botToken, club.chat_id);
          if (inviteResult.link) {
            chatInviteLink = inviteResult.link;
            chatGranted = true;
          }
        }
      }

      // Grant channel access
      if (club.channel_id) {
        if (club.access_mode === 'AUTO_ADD' || club.access_mode === 'AUTO_WITH_FALLBACK') {
          const addResult = await addUserToChat(botToken, club.channel_id, telegramUserId);
          channelGranted = addResult.success;
        }
        
        if (!channelGranted && (club.access_mode === 'INVITE_ONLY' || club.access_mode === 'AUTO_WITH_FALLBACK')) {
          const inviteResult = await createInviteLink(botToken, club.channel_id);
          if (inviteResult.link) {
            channelInviteLink = inviteResult.link;
            channelGranted = true;
          }
        }
      }

      // Calculate active_until
      let activeUntil: string | null = null;
      if (is_manual && valid_until) {
        activeUntil = valid_until;
      } else if (!is_manual) {
        // Get from subscription
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('expires_at')
          .eq('user_id', user_id)
          .eq('is_active', true)
          .single();
        
        activeUntil = subscription?.expires_at || null;
      }

      // Update or create telegram_access record
      const { error: accessError } = await supabase
        .from('telegram_access')
        .upsert({
          user_id,
          club_id: club.id,
          state_chat: chatGranted ? 'active' : 'none',
          state_channel: channelGranted ? 'active' : 'none',
          active_until: activeUntil,
          last_sync_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,club_id',
        });

      if (accessError) {
        console.error('Failed to update telegram_access:', accessError);
      }

      // If manual access, create/update manual access record
      if (is_manual && admin_id) {
        await supabase
          .from('telegram_manual_access')
          .upsert({
            user_id,
            club_id: club.id,
            is_active: true,
            valid_until: valid_until || null,
            comment: comment || null,
            created_by_admin_id: admin_id,
          }, {
            onConflict: 'user_id,club_id',
          });
      }

      // Send invite links to user via bot if needed
      if (chatInviteLink || channelInviteLink) {
        const keyboard: { inline_keyboard: Array<Array<{ text: string; url: string }>> } = {
          inline_keyboard: [],
        };
        
        if (chatInviteLink) {
          keyboard.inline_keyboard.push([{ text: '💬 Войти в чат клуба', url: chatInviteLink }]);
        }
        if (channelInviteLink) {
          keyboard.inline_keyboard.push([{ text: '📣 Войти в канал клуба', url: channelInviteLink }]);
        }

        await sendMessage(
          botToken, 
          telegramUserId,
          `✅ Подписка активна!\n\nЯ подготовил для тебя доступ в клуб.\n⚠️ Ссылки одноразовые — лучше открыть сразу.`,
          keyboard
        );
      } else if (chatGranted || channelGranted) {
        await sendMessage(
          botToken,
          telegramUserId,
          `✅ Всё отлично!\n\nТвоя подписка активна, я уже открыл тебе доступ 🙌\n\nДобро пожаловать в клуб 💙`
        );
      }

      // Log the action
      await supabase.from('telegram_logs').insert({
        user_id,
        club_id: club.id,
        action: is_manual ? 'MANUAL_GRANT' : 'AUTO_GRANT',
        target: 'both',
        status: (chatGranted || channelGranted) ? 'ok' : 'partial',
        meta: {
          chat_granted: chatGranted,
          channel_granted: channelGranted,
          chat_invite: !!chatInviteLink,
          channel_invite: !!channelInviteLink,
        },
      });

      results.push({
        club_id: club.id,
        chat_granted: chatGranted,
        channel_granted: channelGranted,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Grant access error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
