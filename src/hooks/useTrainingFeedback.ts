import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface GetOrCreateFeedbackParams {
  studentUserId: string;
  lessonId: string;
  blockId?: string | null;
  moduleId?: string | null;
  subject?: string;
  description?: string;
}

interface FeedbackTicketResult {
  success: boolean;
  ticket_id?: string;
  ticket_number?: string;
  existing?: boolean;
  error?: string;
  error_code?: string;
}

/**
 * P4 + P4.1: getOrCreate feedback ticket via RPC with fallback direct INSERT.
 */
export function useGetOrCreateFeedbackTicket() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: GetOrCreateFeedbackParams): Promise<FeedbackTicketResult> => {
      // --- Primary path: RPC ---
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "create_feedback_ticket",
        {
          p_student_user_id: params.studentUserId,
          p_lesson_id: params.lessonId,
          p_block_id: params.blockId || null,
          p_module_id: params.moduleId || null,
          p_subject: params.subject || "Обратная связь по уроку",
          p_description: params.description || "Обратная связь преподавателя",
        }
      );

      if (!rpcError && rpcResult) {
        const result = rpcResult as unknown as FeedbackTicketResult;
        if (result.success) {
          return result;
        }
        // If RPC returned structured error that's NOT database_error, propagate it
        if (result.error_code && result.error_code !== "database_error") {
          return result;
        }
        // Fall through to fallback for database_error
        console.warn("[useGetOrCreateFeedbackTicket] RPC database_error, trying fallback");
      } else if (rpcError) {
        console.warn("[useGetOrCreateFeedbackTicket] RPC call failed, trying fallback:", rpcError.message);
      }

      // --- P4.1: Fallback direct INSERT with guard conditions ---
      return await fallbackDirectInsert(params);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["student-feedback-tickets"] });
        queryClient.invalidateQueries({ queryKey: ["lesson-feedback-threads"] });
      }
    },
    onError: (error: Error) => {
      console.error("[useGetOrCreateFeedbackTicket] Error:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать тред обратной связи",
        variant: "destructive",
      });
    },
  });
}

/**
 * P4.1: Fallback direct INSERT with full guard conditions.
 * Used when RPC fails due to RLS/SECURITY DEFINER issues.
 */
async function fallbackDirectInsert(params: GetOrCreateFeedbackParams): Promise<FeedbackTicketResult> {
  // Guard 1: Check for existing ticket (same conditions as RPC)
  const existingQuery = supabase
    .from("ticket_training_context")
    .select("ticket_id, support_tickets!inner(id, user_id, category)")
    .eq("lesson_id", params.lessonId)
    .eq("support_tickets.user_id", params.studentUserId)
    .eq("support_tickets.category", "training_feedback");

  if (params.blockId) {
    existingQuery.eq("block_id", params.blockId);
  } else {
    existingQuery.is("block_id", null);
  }

  const { data: existingRows } = await existingQuery.limit(1);

  if (existingRows && existingRows.length > 0) {
    return {
      success: true,
      ticket_id: existingRows[0].ticket_id,
      existing: true,
    };
  }

  // Guard 2: Get student profile_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", params.studentUserId)
    .single();

  if (!profile) {
    return { success: false, error: "Student profile not found", error_code: "profile_not_found" };
  }

  // Guard 3: Generate ticket_number via atomic RPC
  const { data: ticketNumber, error: numError } = await supabase.rpc("generate_ticket_number_atomic");
  if (numError || !ticketNumber) {
    console.error("[fallbackDirectInsert] Failed to generate ticket number:", numError);
    return { success: false, error: "Internal error", error_code: "database_error" };
  }

  // Guard 4: INSERT support_ticket
  const { data: newTicket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: params.studentUserId,
      profile_id: profile.id,
      subject: params.subject || "Обратная связь по уроку",
      description: params.description || "Обратная связь преподавателя",
      category: "training_feedback",
      ticket_number: ticketNumber as string,
      status: "open",
      priority: "normal",
      has_unread_admin: false,
      has_unread_user: true,
    })
    .select("id")
    .single();

  if (ticketError || !newTicket) {
    console.error("[fallbackDirectInsert] Failed to insert ticket:", ticketError);
    return { success: false, error: "Internal error", error_code: "database_error" };
  }

  // Guard 5: INSERT ticket_training_context
  const { error: ctxError } = await supabase
    .from("ticket_training_context")
    .insert({
      ticket_id: newTicket.id,
      lesson_id: params.lessonId,
      block_id: params.blockId || null,
      module_id: params.moduleId || null,
    });

  if (ctxError) {
    console.error("[fallbackDirectInsert] Failed to insert context:", ctxError);
    return { success: false, error: "Internal error", error_code: "database_error" };
  }

  // Guard 6: Sanity check — re-read to confirm
  const { data: verifyTicket } = await supabase
    .from("support_tickets")
    .select("id, ticket_number")
    .eq("id", newTicket.id)
    .single();

  if (!verifyTicket) {
    console.error("[fallbackDirectInsert] Sanity check failed: ticket not found after insert");
    return { success: false, error: "Internal error", error_code: "database_error" };
  }

  return {
    success: true,
    ticket_id: verifyTicket.id,
    ticket_number: verifyTicket.ticket_number,
    existing: false,
  };
}

/**
 * P4: Student feedback tickets list (category='training_feedback')
 */
export function useStudentFeedbackTickets(status?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["student-feedback-tickets", user?.id, status],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", user!.id)
        .eq("category", "training_feedback")
        .order("updated_at", { ascending: false });

      if (status === "open") {
        q = q.in("status", ["open", "in_progress", "waiting_user"]);
      } else if (status === "closed") {
        q = q.in("status", ["resolved", "closed"]);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Realtime for feedback tickets
  // Uses existing realtime on support_tickets — invalidate on changes
  // (realtime channel already set up in useUserTickets for all user tickets)

  return query;
}

/**
 * P4: Unread feedback count for student badge
 */
export function useUnreadFeedbackCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["unread-feedback-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("category", "training_feedback")
        .eq("has_unread_user", true);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });
}

/**
 * P4: Check existing feedback threads for a lesson/student
 */
export function useLessonFeedbackThreads(lessonId: string | undefined, studentUserId: string | undefined) {
  return useQuery({
    queryKey: ["lesson-feedback-threads", lessonId, studentUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_training_context")
        .select("ticket_id, block_id, lesson_id, support_tickets!inner(id, status, category, has_unread_admin)")
        .eq("lesson_id", lessonId!)
        .eq("support_tickets.user_id", studentUserId!)
        .eq("support_tickets.category", "training_feedback");

      if (error) throw error;
      return data;
    },
    enabled: !!lessonId && !!studentUserId,
  });
}
