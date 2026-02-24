import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type EmojiReaction = {
  emoji: string;
  count: number;
  userReacted: boolean;
};

export type MessageReactionsMap = Record<string, EmojiReaction[]>;

function buildReactionsMap(
  rows: Array<{ message_id: string; emoji: string; user_id: string }>,
  currentUserId?: string | null
): MessageReactionsMap {
  const result: MessageReactionsMap = {};
  for (const row of rows) {
    if (!result[row.message_id]) result[row.message_id] = [];
    const arr = result[row.message_id];

    const existing = arr.find((r) => r.emoji === row.emoji);
    if (existing) {
      existing.count += 1;
      if (currentUserId && row.user_id === currentUserId) existing.userReacted = true;
    } else {
      arr.push({
        emoji: row.emoji,
        count: 1,
        userReacted: currentUserId ? row.user_id === currentUserId : false,
      });
    }
  }
  return result;
}

export function useTelegramReactions(messageIds: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const stableIds = useMemo(() => messageIds.filter(Boolean), [messageIds]);

  const query = useQuery({
    queryKey: ["telegram-reactions", stableIds],
    queryFn: async () => {
      if (!stableIds.length) return {} as MessageReactionsMap;

      const { data, error } = await supabase
        .from("telegram_message_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", stableIds);

      if (error) throw error;
      return buildReactionsMap(data || [], user?.id);
    },
    enabled: stableIds.length > 0 && !!user?.id,
  });

  useEffect(() => {
    if (!stableIds.length) return;

    const channel = supabase
      .channel("telegram-reactions-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telegram_message_reactions" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["telegram-reactions"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stableIds.length, queryClient]);

  return query;
}

export function useToggleTelegramReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data: existing, error: existingError } = await supabase
        .from("telegram_message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        const { error } = await supabase
          .from("telegram_message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("telegram_message_reactions")
          .insert({
            message_id: messageId,
            user_id: user.id,
            emoji,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-reactions"] });
    },
  });
}
