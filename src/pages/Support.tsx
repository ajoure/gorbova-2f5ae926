import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Loader2, MessageSquare, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TicketCard } from "@/components/support/TicketCard";
import { CreateTicketDialog } from "@/components/support/CreateTicketDialog";
import { useUserTickets } from "@/hooks/useTickets";
import { useStudentFeedbackTickets, useUnreadFeedbackCount } from "@/hooks/useTrainingFeedback";
import { DashboardLayout } from "@/components/layout/DashboardLayout";


export default function Support() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<string>("support");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<string>("open");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // P6.1: NULL-safe exclude training_feedback from main support list
  const { data: tickets, isLoading } = useUserTickets(statusFilter, "training_feedback");
  const { data: feedbackTickets, isLoading: feedbackLoading } = useStudentFeedbackTickets(feedbackStatusFilter);
  const { data: unreadFeedbackCount } = useUnreadFeedbackCount();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Поддержка</h1>
            <p className="text-muted-foreground">
              Задайте вопрос или просмотрите обратную связь
            </p>
          </div>
          {mainTab === "support" && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Новое обращение
            </Button>
          )}
        </div>

        {/* Top-level tabs: Техподдержка / Обратная связь */}
        <Tabs value={mainTab} onValueChange={setMainTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="support" className="gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Техподдержка
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5">
              <GraduationCap className="h-4 w-4" />
              Обратная связь
              {(unreadFeedbackCount ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-xs px-1">
                  {unreadFeedbackCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab: Техподдержка */}
          <TabsContent value="support" className="mt-4">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
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
          </TabsContent>

          {/* Tab: Обратная связь */}
          <TabsContent value="feedback" className="mt-4">
            <Tabs value={feedbackStatusFilter} onValueChange={setFeedbackStatusFilter} className="mb-4">
              <TabsList>
                <TabsTrigger value="open">Открытые</TabsTrigger>
                <TabsTrigger value="closed">Закрытые</TabsTrigger>
              </TabsList>
            </Tabs>

            {feedbackLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : feedbackTickets?.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {feedbackStatusFilter === "open" ? "Нет открытых обращений" : "Нет закрытых обращений"}
                </h3>
                <p className="text-muted-foreground">
                  Здесь будет отображаться обратная связь от преподавателя по вашим заданиям
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedbackTickets?.map((ticket: any) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => navigate(`/support/${ticket.id}`)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <CreateTicketDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}
