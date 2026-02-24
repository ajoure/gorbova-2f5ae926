import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Users, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface LessonViewersModalProps {
  lessonId: string;
  lessonTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ViewerRow {
  userId: string;
  fullName: string;
  email: string;
  completedAt: string | null;
}

export function LessonViewersModal({
  lessonId,
  lessonTitle,
  open,
  onOpenChange,
}: LessonViewersModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["lesson-viewers", lessonId],
    queryFn: async (): Promise<{ viewers: ViewerRow[]; fallback: boolean }> => {
      // Attempt 1: JOIN via FK (fast path)
      try {
        const { data: joined, error } = await supabase
          .from("lesson_progress")
          .select(`
            user_id,
            completed_at,
            profiles!inner(full_name, email)
          `)
          .eq("lesson_id", lessonId)
          .order("completed_at", { ascending: false, nullsFirst: false });

        if (!error && joined && joined.length > 0) {
          return {
            viewers: joined.map((row: any) => ({
              userId: row.user_id,
              fullName: row.profiles?.full_name || "—",
              email: row.profiles?.email || "—",
              completedAt: row.completed_at,
            })),
            fallback: false,
          };
        }

        // If JOIN returned 0 rows but no error, check if there's actually progress data
        if (!error && joined && joined.length === 0) {
          const { count } = await supabase
            .from("lesson_progress")
            .select("id", { count: "exact", head: true })
            .eq("lesson_id", lessonId);

          if (!count || count === 0) {
            return { viewers: [], fallback: false };
          }
          // There IS progress but JOIN failed to match profiles — fall through to fallback
        }
      } catch {
        // JOIN failed — fall through to fallback
      }

      // Attempt 2: Fallback — two separate queries (permanent graceful degradation)
      const { data: progressRows, error: progressError } = await supabase
        .from("lesson_progress")
        .select("user_id, completed_at")
        .eq("lesson_id", lessonId)
        .order("completed_at", { ascending: false, nullsFirst: false });

      if (progressError || !progressRows || progressRows.length === 0) {
        return { viewers: [], fallback: false };
      }

      const userIds = [...new Set(progressRows.map((r) => r.user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      return {
        viewers: progressRows.map((row) => {
          const profile = profileMap.get(row.user_id);
          return {
            userId: row.user_id,
            fullName: profile?.full_name || "—",
            email: profile?.email || "—",
            completedAt: row.completed_at,
          };
        }),
        fallback: true,
      };
    },
    enabled: open && !!lessonId,
  });

  const viewers = data?.viewers;
  const isFallback = data?.fallback;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg backdrop-blur-xl bg-background/95 dark:bg-background/90 border-border/50">
        <DialogHeader>
          <DialogTitle className="text-base">{lessonTitle}</DialogTitle>
          <p className="text-xs text-muted-foreground">Просмотры и завершения</p>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (!viewers || viewers.length === 0) && (
          <div className="text-center py-8">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Никто ещё не просмотрел этот урок</p>
          </div>
        )}

        {!isLoading && viewers && viewers.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto">
            {isFallback && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 px-1">
                <AlertCircle className="h-3 w-3" />
                <span>Данные загружены в резервном режиме</span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Имя</th>
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Email</th>
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Завершено</th>
                </tr>
              </thead>
              <tbody>
                {viewers.map((v, idx) => (
                  <tr key={`${v.userId}-${idx}`} className="border-b border-border/30">
                    <td className="py-2 px-1">{v.fullName}</td>
                    <td className="py-2 px-1 text-muted-foreground text-xs">{v.email}</td>
                    <td className="py-2 px-1 text-xs">
                      {v.completedAt ? (
                        <span className="text-primary">
                          {format(new Date(v.completedAt), "d MMM yyyy", { locale: ru })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
