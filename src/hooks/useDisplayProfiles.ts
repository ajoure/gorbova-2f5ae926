import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DisplayProfile {
  user_id: string;
  avatar_url: string | null;
  full_name: string | null;
}

/**
 * Given an array of user IDs, fetches their avatar_url + full_name from profiles.
 * Returns a Map<user_id, DisplayProfile>.
 */
export function useDisplayProfiles(userIds: string[]) {
  return useQuery({
    queryKey: ["display-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return new Map<string, DisplayProfile>();

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, avatar_url, full_name")
        .in("user_id", userIds);

      if (error) throw error;

      const map = new Map<string, DisplayProfile>();
      for (const p of data || []) {
        map.set(p.user_id, {
          user_id: p.user_id,
          avatar_url: p.avatar_url,
          full_name: p.full_name,
        });
      }
      return map;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
