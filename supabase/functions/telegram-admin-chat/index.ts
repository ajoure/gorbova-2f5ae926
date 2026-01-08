import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatAction {
  action: "send_message" | "get_messages";
  user_id?: string;
  message?: string;
  bot_id?: string;
  limit?: number;
}

async function telegramRequest(botToken: string, method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: hasAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: ChatAction = await req.json();
    const { action } = payload;

    switch (action) {
      case "send_message": {
        const { user_id, message, bot_id } = payload;

        if (!user_id || !message) {
          return new Response(JSON.stringify({ error: "user_id and message required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get user's telegram_user_id from profile
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("telegram_user_id, telegram_link_bot_id")
          .eq("user_id", user_id)
          .single();

        if (profileError || !profile?.telegram_user_id) {
          return new Response(JSON.stringify({ 
            error: "User has no linked Telegram account",
            success: false,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get bot token - prefer specified bot_id, then user's linked bot, then default
        let botToken: string | null = null;
        let usedBotId: string | null = null;

        if (bot_id) {
          const { data: bot } = await supabase
            .from("telegram_bots")
            .select("id, bot_token")
            .eq("id", bot_id)
            .single();
          if (bot?.bot_token) {
            botToken = bot.bot_token;
            usedBotId = bot.id;
          }
        }

        if (!botToken && profile.telegram_link_bot_id) {
          const { data: bot } = await supabase
            .from("telegram_bots")
            .select("id, bot_token")
            .eq("id", profile.telegram_link_bot_id)
            .single();
          if (bot?.bot_token) {
            botToken = bot.bot_token;
            usedBotId = bot.id;
          }
        }

        if (!botToken) {
          // Get default bot
          const { data: defaultBot } = await supabase
            .from("telegram_bots")
            .select("id, bot_token")
            .eq("is_default", true)
            .single();
          if (defaultBot?.bot_token) {
            botToken = defaultBot.bot_token;
            usedBotId = defaultBot.id;
          }
        }

        if (!botToken) {
          return new Response(JSON.stringify({ 
            error: "No bot available for sending messages",
            success: false,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Send message via Telegram
        const sendResult = await telegramRequest(botToken, "sendMessage", {
          chat_id: profile.telegram_user_id,
          text: message,
          parse_mode: "HTML",
        });

        // Log the message
        const messageLogData = {
          user_id,
          telegram_user_id: profile.telegram_user_id,
          bot_id: usedBotId,
          direction: "outgoing",
          message_text: message,
          message_id: sendResult.ok ? sendResult.result.message_id : null,
          sent_by_admin: user.id,
          status: sendResult.ok ? "sent" : "failed",
          error_message: sendResult.ok ? null : sendResult.description,
          meta: { telegram_response: sendResult },
        };

        await supabase.from("telegram_messages").insert(messageLogData);

        // Also log to telegram_logs for consistency
        await supabase.from("telegram_logs").insert({
          user_id,
          action: "ADMIN_CHAT_MESSAGE",
          target: "user",
          status: sendResult.ok ? "ok" : "error",
          error_message: sendResult.ok ? null : sendResult.description,
          meta: {
            message_preview: message.substring(0, 100),
            sent_by_admin: user.id,
          },
        });

        return new Response(JSON.stringify({
          success: sendResult.ok,
          message_id: sendResult.result?.message_id,
          error: sendResult.ok ? null : sendResult.description,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_messages": {
        const { user_id, limit = 50 } = payload;

        if (!user_id) {
          return new Response(JSON.stringify({ error: "user_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: messages, error: messagesError } = await supabase
          .from("telegram_messages")
          .select(`
            *,
            telegram_bots(id, bot_name, bot_username)
          `)
          .eq("user_id", user_id)
          .order("created_at", { ascending: true })
          .limit(limit);

        if (messagesError) {
          return new Response(JSON.stringify({ error: messagesError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ messages: messages || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
