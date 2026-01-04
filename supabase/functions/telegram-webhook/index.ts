import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
  my_chat_member?: {
    chat: {
      id: number;
      title?: string;
      type: string;
    };
    from: {
      id: number;
    };
    new_chat_member: {
      status: string;
      user: {
        id: number;
      };
    };
  };
}

// Bot messages in Russian
const MESSAGES = {
  welcome: `👋 Привет!

Я бот клуба Gorbova Club.

Через меня ты получишь доступ к закрытому каналу и чату клуба ✨

Если у тебя есть активная подписка — я подключу тебя автоматически.

Если нет — подскажу, как её оформить.`,

  accessGranted: `✅ Всё отлично!

Твоя подписка активна, я уже открыл тебе доступ 🙌

Добро пожаловать в клуб 💙`,

  accessWithLinks: `✅ Подписка активна!

Я подготовил для тебя доступ в клуб.
⚠️ Ссылки одноразовые — лучше открыть сразу.`,

  subscriptionExpiring: `⏰ Небольшое напоминание

Твоя подписка в Gorbova Club заканчивается совсем скоро.

Чтобы не потерять доступ к чату и материалам, просто продли её заранее 💙`,

  accessRevoked: `❌ Подписка завершена

Срок твоей подписки в Gorbova Club истёк, поэтому доступ к чату и каналу временно закрыт.

Ты можешь в любой момент вернуться — просто продли подписку 👇`,

  noSubscription: `🔒 Доступ закрыт

Сейчас у тебя нет активной подписки, поэтому я не могу добавить тебя в клуб.

Как только подписка будет оформлена — доступ появится автоматически 💫`,

  notLinked: `🤝 Давай познакомимся

Чтобы я мог добавить тебя в чат и канал, нужно связать твой Telegram с аккаунтом клуба.

Просто нажми кнопку ниже 👇`,

  manualAccess: `🎁 Тебе выдан специальный доступ

Администратор открыл тебе доступ в Gorbova Club вручную.

Добро пожаловать 💙`,

  error: `⚠️ Что-то пошло не так

Я временно не смог проверить доступ.

Попробуй чуть позже или напиши администратору 💬

Спасибо за терпение 💙`,

  linkSuccess: `✅ Telegram успешно привязан!

Теперь я могу управлять твоим доступом к клубу.`,

  linkExpired: `❌ Ссылка устарела

Эта ссылка для привязки уже не действует.

Пожалуйста, сгенерируй новую в личном кабинете.`,

  linkAlreadyUsed: `⚠️ Ссылка уже использована

Эта ссылка для привязки уже была использована.

Если нужно привязать другой аккаунт, сгенерируй новую ссылку.`,

  alreadyLinked: `ℹ️ Этот Telegram уже привязан к другому аккаунту.

Если это ошибка — обратись к администратору.`,
};

// Send message to Telegram
async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: object) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  return response.json();
}

// Get site URL for buttons
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

    // Get bot_id from URL params
    const url = new URL(req.url);
    const botId = url.searchParams.get('bot_id');
    
    if (!botId) {
      console.error('No bot_id provided in webhook URL');
      return new Response(JSON.stringify({ ok: false, error: 'No bot_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get bot token from database
    const { data: bot, error: botError } = await supabase
      .from('telegram_bots')
      .select('*')
      .eq('id', botId)
      .eq('status', 'active')
      .single();

    if (botError || !bot) {
      console.error('Bot not found or inactive:', botError);
      return new Response(JSON.stringify({ ok: false, error: 'Bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const botToken = bot.bot_token_encrypted; // In production, decrypt this
    const update: TelegramUpdate = await req.json();
    
    console.log('Received Telegram update:', JSON.stringify(update, null, 2));

    // Handle /start command with potential link token
    if (update.message?.text?.startsWith('/start')) {
      const telegramUserId = update.message.from.id;
      const telegramUsername = update.message.from.username;
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      // Check if there's a link token
      const parts = text.split(' ');
      if (parts.length > 1) {
        const linkToken = parts[1];
        
        // Try to process the link token
        const { data: tokenData, error: tokenError } = await supabase
          .from('telegram_link_tokens')
          .select('*')
          .eq('token', linkToken)
          .is('used_at', null)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (tokenError || !tokenData) {
          // Token expired or already used
          await sendMessage(botToken, chatId, 
            tokenData?.used_at ? MESSAGES.linkAlreadyUsed : MESSAGES.linkExpired);
          
          await supabase.from('telegram_logs').insert({
            user_id: tokenData?.user_id,
            action: 'LINK_FAILED',
            target: 'profile',
            status: 'error',
            error_message: tokenError?.message || 'Token expired or used',
            meta: { telegram_user_id: telegramUserId, token: linkToken },
          });
          
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if this Telegram user is already linked to another account
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id, user_id')
          .eq('telegram_user_id', telegramUserId)
          .single();

        if (existingProfile && existingProfile.user_id !== tokenData.user_id) {
          await sendMessage(botToken, chatId, MESSAGES.alreadyLinked);
          
          await supabase.from('telegram_logs').insert({
            user_id: tokenData.user_id,
            action: 'LINK_CONFLICT',
            target: 'profile',
            status: 'error',
            error_message: 'Telegram already linked to another user',
            meta: { telegram_user_id: telegramUserId, existing_user_id: existingProfile.user_id },
          });
          
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Link the Telegram account
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_linked_at: new Date().toISOString(),
          })
          .eq('user_id', tokenData.user_id);

        if (updateError) {
          console.error('Failed to link Telegram:', updateError);
          await sendMessage(botToken, chatId, MESSAGES.error);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Mark token as used
        await supabase
          .from('telegram_link_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('id', tokenData.id);

        // Log success
        await supabase.from('telegram_logs').insert({
          user_id: tokenData.user_id,
          action: 'LINK_SUCCESS',
          target: 'profile',
          status: 'ok',
          meta: { telegram_user_id: telegramUserId, telegram_username: telegramUsername },
        });

        await sendMessage(botToken, chatId, MESSAGES.linkSuccess);

        // Check if user has active subscription and grant access
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', tokenData.user_id)
          .eq('is_active', true)
          .gte('expires_at', new Date().toISOString())
          .single();

        if (subscription) {
          // Trigger access grant via edge function
          await supabase.functions.invoke('telegram-grant-access', {
            body: { user_id: tokenData.user_id },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Regular /start without token - check user status
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!profile) {
        // User not linked - show welcome with link button
        const keyboard = {
          inline_keyboard: [
            [{ text: '🔗 Привязать Telegram', url: `${getSiteUrl()}/dashboard` }],
            [{ text: '💳 Оформить подписку', url: `${getSiteUrl()}/pricing` }],
          ],
        };
        await sendMessage(botToken, chatId, MESSAGES.welcome, keyboard);
      } else {
        // Check subscription status
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', profile.user_id)
          .eq('is_active', true)
          .single();

        if (subscription && subscription.expires_at && new Date(subscription.expires_at) > new Date()) {
          // Active subscription
          const keyboard = {
            inline_keyboard: [
              [{ text: '🔐 Проверить доступ', callback_data: 'check_access' }],
            ],
          };
          await sendMessage(botToken, chatId, MESSAGES.accessGranted, keyboard);
        } else {
          // No active subscription
          const keyboard = {
            inline_keyboard: [
              [{ text: '💳 Оформить подписку', url: `${getSiteUrl()}/pricing` }],
            ],
          };
          await sendMessage(botToken, chatId, MESSAGES.noSubscription, keyboard);
        }
      }
    }

    // Handle my_chat_member updates (bot added to chat/channel)
    if (update.my_chat_member) {
      const chatMember = update.my_chat_member;
      const chatType = chatMember.chat.type;
      const chatIdValue = chatMember.chat.id;
      const newStatus = chatMember.new_chat_member.status;

      console.log(`Bot status changed in ${chatType} ${chatIdValue}: ${newStatus}`);

      // If bot was made admin, try to update club records
      if (newStatus === 'administrator') {
        // Update clubs that have matching invite links or pending status
        if (chatType === 'supergroup' || chatType === 'group') {
          await supabase
            .from('telegram_clubs')
            .update({ 
              chat_id: chatIdValue, 
              chat_status: 'active' 
            })
            .eq('bot_id', botId)
            .is('chat_id', null);
        } else if (chatType === 'channel') {
          await supabase
            .from('telegram_clubs')
            .update({ 
              channel_id: chatIdValue, 
              channel_status: 'active' 
            })
            .eq('bot_id', botId)
            .is('channel_id', null);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
