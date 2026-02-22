import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface LessonViewersModalProps {
  lessonId: string;
  lessonTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LessonViewersModal({
  lessonId,
  lessonTitle,
  open,
  onOpenChange,
}: LessonViewersModalProps) {
  const { data: viewers, isLoading } = useQuery({
    queryKey: ["lesson-viewers", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select(`
          user_id,
          completed_at,
          profiles!inner(full_name, email)
        `)
        .eq("lesson_id", lessonId)
        .order("completed_at", { ascending: false, nullsFirst: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        userId: row.user_id,
        fullName: row.profiles?.full_name || "—",
        email: row.profiles?.email || "—",
        completedAt: row.completed_at,
      }));
    },
    enabled: open && !!lessonId,
  });

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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Имя</th>
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Email</th>
                  <th className="text-left py-2 px-1 font-medium text-muted-foreground">Завершено</th>
                </tr>
              </thead>
              <tbody>
                {viewers.map((v) => (
                  <tr key={v.userId} className="border-b border-border/30">
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
