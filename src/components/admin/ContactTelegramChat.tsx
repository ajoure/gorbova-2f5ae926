import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  MessageCircle,
  Bot,
  User,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface ContactTelegramChatProps {
  userId: string;
  telegramUserId: number | null;
  telegramUsername: string | null;
}

interface TelegramMessage {
  id: string;
  direction: "outgoing" | "incoming";
  message_text: string | null;
  status: string;
  created_at: string;
  sent_by_admin: string | null;
  telegram_bots?: {
    id: string;
    bot_name: string;
    bot_username: string;
  } | null;
}

export function ContactTelegramChat({
  userId,
  telegramUserId,
  telegramUsername,
}: ContactTelegramChatProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ["telegram-chat", userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("telegram-admin-chat", {
        body: { action: "get_messages", user_id: userId },
      });
      if (error) throw error;
      return (data.messages || []) as TelegramMessage[];
    },
    enabled: !!userId && !!telegramUserId,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke("telegram-admin-chat", {
        body: { action: "send_message", user_id: userId, message: text },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to send message");
      return data;
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["telegram-chat", userId] });
      toast.success("Сообщение отправлено");
    },
    onError: (error) => {
      toast.error("Ошибка отправки: " + (error as Error).message);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!telegramUserId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Telegram не привязан</p>
          <p className="text-sm mt-1">Клиент должен привязать свой Telegram аккаунт</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-500" />
          <span className="font-medium">Telegram чат</span>
          {telegramUsername && (
            <Badge variant="secondary" className="text-xs">
              @{telegramUsername}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 py-3" ref={scrollRef}>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-3/4" />
            ))}
          </div>
        ) : !messages?.length ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Нет сообщений</p>
              <p className="text-xs">Начните диалог, отправив сообщение</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === "outgoing" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.direction === "outgoing"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    {msg.direction === "outgoing" ? (
                      <Bot className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                    <span className="text-xs opacity-70">
                      {msg.direction === "outgoing" ? "Вы" : "Клиент"}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message_text}</p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-xs opacity-60">
                      {format(new Date(msg.created_at), "HH:mm", { locale: ru })}
                    </span>
                    {msg.direction === "outgoing" && (
                      <>
                        {msg.status === "sent" && <CheckCircle className="w-3 h-3 opacity-60" />}
                        {msg.status === "failed" && <AlertCircle className="w-3 h-3 text-destructive" />}
                        {msg.status === "pending" && <Clock className="w-3 h-3 opacity-60" />}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="pt-3 border-t">
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Введите сообщение..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={sendMutation.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="h-auto"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Enter для отправки, Shift+Enter для новой строки
        </p>
      </div>
    </div>
  );
}
