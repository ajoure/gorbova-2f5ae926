import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { MessageSquare, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { cn } from "@/lib/utils";
import type { SupportTicket } from "@/hooks/useTickets";

interface TicketCardProps {
  ticket: SupportTicket;
  onClick?: () => void;
  isSelected?: boolean;
  showProfile?: boolean;
}

export function TicketCard({ ticket, onClick, isSelected, showProfile }: TicketCardProps) {
  const hasUnread = ticket.has_unread_user || ticket.has_unread_admin;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50",
        isSelected && "border-primary bg-accent",
        hasUnread && "border-l-4 border-l-primary"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground font-mono">
                {ticket.ticket_number}
              </span>
              {ticket.is_starred && (
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              )}
            </div>
            <h4 className={cn(
              "text-sm truncate",
              hasUnread ? "font-semibold" : "font-medium"
            )}>
              {ticket.subject}
            </h4>
            {showProfile && ticket.profiles && (
              <p className="text-xs text-muted-foreground mt-1">
                {ticket.profiles.full_name || ticket.profiles.email}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(ticket.updated_at), {
                addSuffix: true,
                locale: ru,
              })}
            </span>
            <TicketStatusBadge status={ticket.status} />
          </div>
        </div>
        {hasUnread && (
          <div className="flex items-center gap-1 mt-2 text-xs text-primary">
            <MessageSquare className="h-3 w-3" />
            <span>Новое сообщение</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
