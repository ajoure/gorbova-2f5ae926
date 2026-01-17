import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Check, X, RefreshCw, Settings, Trash2, ExternalLink } from "lucide-react";
import { IntegrationInstance, useIntegrationMutations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { KinescopeConnectionDialog } from "./KinescopeConnectionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface KinescopeSettingsCardProps {
  instance: IntegrationInstance | null;
  onRefresh?: () => void;
}

export function KinescopeSettingsCard({ instance, onRefresh }: KinescopeSettingsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const queryClient = useQueryClient();
  const { deleteInstance } = useIntegrationMutations();

  const handleHealthCheck = async () => {
    if (!instance) return;
    
    setIsChecking(true);
    toast.info("Проверка подключения Kinescope...");

    try {
      const { data, error } = await supabase.functions.invoke("integration-healthcheck", {
        body: {
          provider: "kinescope",
          instance_id: instance.id,
          config: instance.config,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["integration-instances"] });

      if (error) {
        toast.error(`Ошибка проверки: ${error.message}`);
        return;
      }

      if (data?.success) {
        toast.success(`Kinescope подключен! Проектов: ${data.data?.projects_count || 0}`);
      } else {
        toast.error(`Ошибка подключения: ${data?.error || "Неизвестная ошибка"}`);
      }
    } catch (err) {
      toast.error("Ошибка при проверке");
    } finally {
      setIsChecking(false);
    }
  };

  const handleDelete = async () => {
    if (!instance) return;
    
    try {
      await deleteInstance.mutateAsync(instance.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      // Error handled by mutation
    }
  };

  const isConnected = instance?.status === "connected";
  const hasError = instance?.status === "error";
  const projectsCount = (instance?.config?.projects_count as number) || 0;

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isConnected ? "bg-primary/10" : "bg-muted"}`}>
                <Video className={`h-5 w-5 ${isConnected ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Kinescope
                  {instance && (
                    <Badge variant={isConnected ? "default" : hasError ? "destructive" : "secondary"}>
                      {isConnected ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Подключено
                        </>
                      ) : hasError ? (
                        <>
                          <X className="h-3 w-3 mr-1" />
                          Ошибка
                        </>
                      ) : (
                        "Не проверено"
                      )}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Видеохостинг для онлайн-курсов с защитой контента
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {instance ? (
            <>
              {/* Connection info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Проектов:</span>
                  <span className="ml-2 font-medium">{projectsCount}</span>
                </div>
                {instance.last_check_at && (
                  <div>
                    <span className="text-muted-foreground">Проверено:</span>
                    <span className="ml-2 font-medium">
                      {new Date(instance.last_check_at).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>

              {hasError && instance.error_message && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {instance.error_message}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHealthCheck}
                  disabled={isChecking}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`} />
                  Проверить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Настройки
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a href="https://app.kinescope.io" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Открыть Kinescope
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">
                Подключите Kinescope для хостинга видео курсов с защитой от скачивания
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Video className="h-4 w-4 mr-2" />
                Подключить Kinescope
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <KinescopeConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existingInstance={instance}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подключение Kinescope?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Все настройки интеграции будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
