import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Calendar, FileText, Zap, MessageSquare, User } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface SyncResult {
  total_messages: number;
  meaningful_messages: number;
  synced: number;
  earliest_date?: string;
  latest_date?: string;
  ready_for_analysis: boolean;
  author?: string;
}

interface SyncResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SyncResult | null;
  onLearnStyle?: () => void;
  isLearnStyleLoading?: boolean;
}

export function SyncResultDialog({ 
  open, 
  onOpenChange, 
  result, 
  onLearnStyle,
  isLearnStyleLoading 
}: SyncResultDialogProps) {
  if (!result) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "dd MMMM yyyy", { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const getDaysDiff = () => {
    if (!result.earliest_date || !result.latest_date) return null;
    try {
      const start = new Date(result.earliest_date);
      const end = new Date(result.latest_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const days = getDaysDiff();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            История чата синхронизирована
          </DialogTitle>
        </DialogHeader>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{result.total_messages}</p>
              <p className="text-xs text-muted-foreground">Всего</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 text-center">
              <FileText className="h-4 w-4 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold text-primary">{result.meaningful_messages}</p>
              <p className="text-xs text-muted-foreground">Для анализа</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <User className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{result.synced}</p>
              <p className="text-xs text-muted-foreground">Сохранено</p>
            </CardContent>
          </Card>
        </div>

        {/* Период */}
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Период охвата</span>
            {days !== null && (
              <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">С: </span>
              <span className="font-medium">{formatDate(result.earliest_date)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">По: </span>
              <span className="font-medium">{formatDate(result.latest_date)}</span>
            </div>
          </div>
        </div>

        {/* Резюме */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <h4 className="font-medium flex items-center gap-2 mb-2 text-sm">
            <FileText className="h-4 w-4" />
            Итоговое резюме
          </h4>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Загружено <strong className="text-foreground">{result.meaningful_messages}</strong> сообщений 
              {result.author && <> от <strong className="text-foreground">{result.author}</strong></>}
              {days !== null && <> за <strong className="text-foreground">{days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</strong></>}.
              {result.ready_for_analysis ? (
                <span className="text-green-600"> Данных достаточно для анализа стиля.</span>
              ) : (
                <span className="text-amber-600"> Требуется минимум 5 сообщений для анализа.</span>
              )}
            </p>
            <div>
              <strong className="text-foreground">Что дальше:</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Нажмите "Обучить стилю" для создания стилевого профиля</li>
                <li>ИИ проанализирует тон, лексику, структуру сообщений</li>
                <li>Результат будет использоваться для генерации контента</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Понятно
          </Button>
          {result.ready_for_analysis && onLearnStyle && (
            <Button onClick={onLearnStyle} disabled={isLearnStyleLoading}>
              <Zap className="h-4 w-4 mr-2" />
              {isLearnStyleLoading ? "Анализируем..." : "Обучить стилю"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
