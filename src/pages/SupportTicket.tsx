import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/support/TicketStatusBadge";
import { TicketChat } from "@/components/support/TicketChat";
import { useTicket } from "@/hooks/useTickets";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export default function SupportTicket() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();

  const { data: ticket, isLoading, error } = useTicket(ticketId);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !ticket) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 md:p-6 max-w-4xl">
          <Button variant="ghost" onClick={() => navigate("/support")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Назад
          </Button>
          <div className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">Обращение не найдено</h3>
            <p className="text-muted-foreground">
              Возможно, оно было удалено или у вас нет доступа
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isClosed = ticket.status === "closed";

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate("/support")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад к обращениям
        </Button>

        <Card className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-muted-foreground font-mono">
                    {ticket.ticket_number}
                  </span>
                  <TicketStatusBadge status={ticket.status} />
                </div>
                <h1 className="text-lg font-semibold">{ticket.subject}</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(ticket.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <TicketChat
              ticketId={ticket.id}
              isAdmin={false}
              isClosed={isClosed}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
