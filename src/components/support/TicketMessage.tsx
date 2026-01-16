import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { User, Headset, Bot, Lock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { TicketMessage as TicketMessageType } from "@/hooks/useTickets";

interface TicketMessageProps {
  message: TicketMessageType;
  isCurrentUser?: boolean;
}

export function TicketMessage({ message, isCurrentUser }: TicketMessageProps) {
  const isSystem = message.author_type === "system";
  const isSupport = message.author_type === "support";

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
          <Bot className="h-3 w-3" />
          <span>{message.message}</span>
          <span>•</span>
          <span>
            {format(new Date(message.created_at), "HH:mm", { locale: ru })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 mb-4",
        isCurrentUser && "flex-row-reverse"
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(
          isSupport 
            ? "bg-primary text-primary-foreground" 
            : "bg-secondary"
        )}>
          {isSupport ? (
            <Headset className="h-4 w-4" />
          ) : (
            <User className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex flex-col max-w-[75%]", isCurrentUser && "items-end")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">
            {isSupport ? "Поддержка" : message.author_name || "Вы"}
          </span>
          {message.is_internal && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Внутреннее
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {format(new Date(message.created_at), "d MMM, HH:mm", { locale: ru })}
          </span>
        </div>

        <div
          className={cn(
            "rounded-lg px-4 py-2.5",
            isCurrentUser
              ? "bg-primary text-primary-foreground"
              : message.is_internal
              ? "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900"
              : "bg-muted"
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.message}</p>
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((url, index) => (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                📎 Вложение {index + 1}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
