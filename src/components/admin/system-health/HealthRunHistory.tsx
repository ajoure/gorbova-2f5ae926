import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SystemHealthRun } from "@/hooks/useSystemHealthRuns";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface HealthRunHistoryProps {
  runs: SystemHealthRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}

export function HealthRunHistory({ runs, selectedRunId, onSelectRun }: HealthRunHistoryProps) {
  const getStatusIcon = (run: SystemHealthRun) => {
    if (run.status === "running") {
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    }
    if (run.status === "failed" || (run.summary?.failed && run.summary.failed > 0)) {
      return <XCircle className="h-4 w-4 text-destructive" />;
    }
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const getRunTypeLabel = (runType: string) => {
    switch (runType) {
      case "nightly":
        return "Ночная";
      case "manual":
        return "Ручная";
      case "cron-hourly":
        return "Почасовая";
      default:
        return runType;
    }
  };

  if (runs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">История пуста</h3>
          <p className="text-muted-foreground">
            Запустите первую проверку системы
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">История проверок</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {runs.map((run) => {
              const failed = run.summary?.failed || 0;
              const passed = run.summary?.passed || 0;
              const total = run.summary?.total_checks || 0;

              return (
                <div
                  key={run.id}
                  onClick={() => onSelectRun(selectedRunId === run.id ? null : run.id)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedRunId === run.id 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(run)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {format(new Date(run.started_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {getRunTypeLabel(run.run_type)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(run.started_at), { 
                            addSuffix: true, 
                            locale: ru 
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      {run.status === "running" ? (
                        <Badge variant="secondary">В процессе...</Badge>
                      ) : (
                        <>
                          <span className="text-green-600">{passed} ✓</span>
                          {failed > 0 && (
                            <span className="text-destructive">{failed} ✗</span>
                          )}
                          <span className="text-muted-foreground">/ {total}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Duration */}
                  {run.finished_at && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Длительность: {Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)} сек
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
