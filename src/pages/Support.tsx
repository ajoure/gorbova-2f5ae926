import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketCard } from "@/components/support/TicketCard";
import { CreateTicketDialog } from "@/components/support/CreateTicketDialog";
import { useUserTickets } from "@/hooks/useTickets";
import { DashboardLayout } from "@/components/layout/DashboardLayout";


export default function Support() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: tickets, isLoading } = useUserTickets(statusFilter);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Техподдержка</h1>
            <p className="text-muted-foreground">
              Задайте вопрос или сообщите о проблеме
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Новое обращение
          </Button>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList>
            <TabsTrigger value="open">Открытые</TabsTrigger>
            <TabsTrigger value="closed">Закрытые</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tickets?.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {statusFilter === "open" ? "Нет открытых обращений" : "Нет закрытых обращений"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {statusFilter === "open"
                ? "Создайте обращение, если у вас есть вопрос или проблема"
                : "Здесь будут отображаться ваши решённые обращения"}
            </p>
            {statusFilter === "open" && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Создать обращение
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets?.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => navigate(`/support/${ticket.id}`)}
              />
            ))}
          </div>
        )}

        <CreateTicketDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}
