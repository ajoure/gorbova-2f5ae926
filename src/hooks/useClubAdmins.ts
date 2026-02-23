import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminInfo {
  telegram_user_id: number;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_username: string | null;
  full_name: string | null;
  role: "creator" | "administrator";
  has_active_access: boolean;
  is_bot: boolean;
}

/**
 * Загружает администраторов клуба напрямую из telegram_club_members
 * по полю last_telegram_check_result (chat.status / channel.status)
 */
export function useClubAdmins(clubId: string | null) {
  return useQuery({
    queryKey: ["club-admins", clubId],
    enabled: !!clubId,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminInfo[]> => {
      if (!clubId) return [];

      // Fetch members whose check result contains administrator or creator
      const { data, error } = await supabase
        .from("telegram_club_members")
        .select("telegram_user_id, telegram_first_name, telegram_last_name, telegram_username, profile_id, last_telegram_check_result")
        .eq("club_id", clubId)
        .or("last_telegram_check_result.cs.{\"chat\":{\"status\":\"administrator\"}},last_telegram_check_result.cs.{\"chat\":{\"status\":\"creator\"}},last_telegram_check_result.cs.{\"channel\":{\"status\":\"administrator\"}},last_telegram_check_result.cs.{\"channel\":{\"status\":\"creator\"}}");

      if (error) {
        console.error("[useClubAdmins] error:", error);
        return [];
      }

      if (!data?.length) return [];

      // Collect profile_ids to check access
      const profileIds = data
        .map((m: any) => m.profile_id)
        .filter(Boolean) as string[];

      // Check active access for these profiles
      let accessMap: Record<string, boolean> = {};
      if (profileIds.length > 0) {
        const now = new Date().toISOString();
        const { data: grants } = await supabase
          .from("telegram_access_grants")
          .select("user_id")
          .eq("club_id", clubId)
          .eq("status", "active")
          .gt("end_at", now)
          .in("user_id", profileIds);

        if (grants) {
          for (const g of grants) {
            accessMap[g.user_id] = true;
          }
        }
      }

      return data.map((m: any) => {
        const r = m.last_telegram_check_result as Record<string, any> | null;
        const chatStatus = r?.chat?.status;
        const channelStatus = r?.channel?.status;
        const role: "creator" | "administrator" =
          chatStatus === "creator" || channelStatus === "creator"
            ? "creator"
            : "administrator";

        const firstName = m.telegram_first_name || "";
        const lastName = m.telegram_last_name || "";
        const is_bot =
          firstName.toLowerCase().includes("bot") ||
          lastName.toLowerCase().includes("bot") ||
          (m.telegram_username || "").toLowerCase().includes("bot");

        return {
          telegram_user_id: m.telegram_user_id,
          telegram_first_name: m.telegram_first_name,
          telegram_last_name: m.telegram_last_name,
          telegram_username: m.telegram_username,
          full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
          role,
          has_active_access: m.profile_id ? !!accessMap[m.profile_id] : false,
          is_bot,
        };
      });
    },
  });
}
