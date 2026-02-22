import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, MessageSquare } from "lucide-react";
import { TicketChat } from "@/components/support/TicketChat";
import { useGetOrCreateFeedbackTicket } from "@/hooks/useTrainingFeedback";

interface FeedbackDrawerProps {
  lessonId: string;
  blockId?: string | null;
  studentUserId: string;
  lessonTitle?: string;
  blockTitle?: string;
  moduleId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDrawer({
  lessonId,
  blockId,
  studentUserId,
  lessonTitle,
  blockTitle,
  moduleId,
  open,
  onOpenChange,
}: FeedbackDrawerProps) {
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const getOrCreate = useGetOrCreateFeedbackTicket();

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setTicketId(null);
      setError(null);
    }
  }, [open]);

  // Create/find ticket when drawer opens
  useEffect(() => {
    if (!open || ticketId || getOrCreate.isPending) return;

    const subject = blockTitle
      ? `Обратная связь: ${blockTitle}`
      : lessonTitle
        ? `Обратная связь: ${lessonTitle}`
        : "Обратная связь по уроку";

    getOrCreate.mutate(
      {
        studentUserId,
        lessonId,
        blockId: blockId || null,
        moduleId: moduleId || null,
        subject,
        description: "Обратная связь преподавателя",
      },
      {
        onSuccess: (result) => {
          if (result.success && result.ticket_id) {
            setTicketId(result.ticket_id);
          } else {
            setError(result.error || "Не удалось создать тред");
          }
        },
        onError: () => {
          setError("Не удалось создать тред обратной связи");
        },
      }
    );
  }, [open, ticketId, studentUserId, lessonId, blockId]);

  const title = blockTitle
    ? `Обратная связь — ${blockTitle}`
    : lessonTitle
      ? `Обратная связь — ${lessonTitle}`
      : "Обратная связь";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0">
          {getOrCreate.isPending && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground text-sm">Загрузка чата...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64 text-destructive text-sm p-4 text-center">
              {error}
            </div>
          )}

          {ticketId && (
            <TicketChat
              ticketId={ticketId}
              isAdmin={true}
              isClosed={false}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
