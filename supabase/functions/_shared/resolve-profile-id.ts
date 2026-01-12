/**
 * Helper для определения profile_id (ОТЗ vFinal, Фаза 7)
 * 
 * Стратегия resolveProfileId:
 * 1. если есть order.profile_id → вернуть его
 * 2. иначе если userId это auth.users.id → найти profiles.id по profiles.user_id=userId
 * 3. иначе (нет маппинга) → логировать и не писать неверный profile_id
 */

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function resolveProfileId(
  supabase: SupabaseClient,
  userId: string,
  orderId?: string | null,
  orderProfileId?: string | null
): Promise<string | null> {
  // 1. Если есть order.profile_id → вернуть его
  if (orderProfileId) {
    return orderProfileId;
  }

  // 2. Если orderId → получить profile_id из order
  if (orderId) {
    const { data: order } = await supabase
      .from("orders_v2")
      .select("profile_id")
      .eq("id", orderId)
      .single();
    
    if (order?.profile_id) {
      return order.profile_id;
    }
  }

  // 3. userId = auth.users.id → найти profiles.id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  
  if (profile?.id) {
    return profile.id;
  }

  // 4. Проверяем, может userId уже является profiles.id
  const { data: profileById } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();
  
  if (profileById?.id) {
    return profileById.id;
  }

  // 5. Нет маппинга → логировать, вернуть null
  console.warn(`resolveProfileId: no profile found for userId=${userId}, orderId=${orderId}`);
  return null;
}
