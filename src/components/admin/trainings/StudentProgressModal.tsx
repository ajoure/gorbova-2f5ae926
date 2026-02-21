import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, Target, Crosshair, FileText, PenLine, Upload } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export interface LessonProgressRecord {
  id: string;
  user_id: string;
  lesson_id: string;
  state_json: unknown;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
}

export interface LessonBlock {
  id: string;
  block_type: string;
  content: unknown;
}

interface FormStep {
  id: string;
  title: string;
  description: string;
}

interface PointARow {
  source_name?: string;
  income?: number;
  task_hours?: number;
  communication_hours?: number;
}

interface StudentProgressModalProps {
  record: LessonProgressRecord | null;
  lessonBlocks: LessonBlock[];
  open: boolean;
  onClose: () => void;
  blockResponses?: Record<string, any>;
}

const roleLabels: Record<string, string> = {
  executor: "Исполнитель",
  freelancer: "Фрилансер",
  entrepreneur: "Предприниматель",
};

function getSequentialFormSteps(blocks: LessonBlock[]): FormStep[] {
  const sequentialBlock = blocks.find(b => b.block_type === "sequential_form");
  if (!sequentialBlock?.content) return [];
  const content = sequentialBlock.content as { steps?: FormStep[] };
  return content.steps || [];
}

async function downloadFile(storagePath: string, originalName: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${baseUrl}/functions/v1/training-assets-download?path=${encodeURIComponent(storagePath)}&name=${encodeURIComponent(originalName)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = originalName;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("[downloadFile] Error:", err);
  }
}

export function StudentProgressModal({
  record,
  lessonBlocks,
  open,
  onClose,
  blockResponses,
}: StudentProgressModalProps) {
  if (!record) return null;

  const state = record.state_json as {
    role?: string;
    pointA_rows?: PointARow[];
    pointA_completed?: boolean;
    pointB_answers?: Record<string, string>;
    pointB_completed?: boolean;
    completedSteps?: string[];
  };

  const profile = record.profiles;
  const steps = getSequentialFormSteps(lessonBlocks);

  const pointARows = state?.pointA_rows || [];
  const totalIncome = pointARows.reduce((sum, r) => sum + (r.income || 0), 0);
  const totalTaskHours = pointARows.reduce((sum, r) => sum + (r.task_hours || 0), 0);
  const totalCommHours = pointARows.reduce((sum, r) => sum + (r.communication_hours || 0), 0);
  const totalHours = totalTaskHours + totalCommHours;
  const hourlyRate = totalHours > 0 ? Math.round(totalIncome / totalHours) : 0;

  const noteEntries = Object.entries(blockResponses || {}).filter(([, r]: any) => r?.type === "note");
  const uploadEntries = Object.entries(blockResponses || {}).filter(([, r]: any) => r?.type === "upload" && r?.file?.storage_path);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Прогресс ученика
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Student Info */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">
                    {profile?.full_name || "Без имени"}
                  </p>
                  <p className="text-muted-foreground">{profile?.email}</p>
                </div>
                {state?.role && (
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {roleLabels[state.role] || state.role}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Point A - Diagnostic Table */}
          {(state?.pointA_rows?.length || state?.pointA_completed) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-5 w-5 text-primary" />
                  Диагностика точки А
                  {state?.pointA_completed && (
                    <Badge variant="default" className="ml-2">Завершено</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pointARows.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Источник дохода</TableHead>
                          <TableHead className="text-right">Доход</TableHead>
                          <TableHead className="text-right">Часы задач</TableHead>
                          <TableHead className="text-right">Часы переписки</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pointARows.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{row.source_name || "—"}</TableCell>
                            <TableCell className="text-right">{row.income || 0} BYN</TableCell>
                            <TableCell className="text-right">{row.task_hours || 0} ч</TableCell>
                            <TableCell className="text-right">{row.communication_hours || 0} ч</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    <Separator className="my-4" />
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">Общий доход</Label>
                        <p className="font-semibold">{totalIncome} BYN</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Часы на задачи</Label>
                        <p className="font-semibold">{totalTaskHours} ч</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Часы переписки</Label>
                        <p className="font-semibold">{totalCommHours} ч</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Доход/час</Label>
                        <p className="font-semibold text-primary">{hourlyRate} BYN/ч</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Данные не заполнены</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Point B - Sequential Form Answers */}
          {(state?.pointB_answers || state?.pointB_completed) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Crosshair className="h-5 w-5 text-primary" />
                  Формула точки B
                  {state?.pointB_completed && (
                    <Badge variant="default" className="ml-2">Завершено</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {steps.length > 0 ? (
                  steps.map((step, idx) => {
                    const answer = state?.pointB_answers?.[step.id];
                    return (
                      <div key={step.id} className="border-b pb-3 last:border-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="shrink-0">
                            {idx + 1}
                          </Badge>
                          <Label className="font-medium">{step.title}</Label>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
                        <p className={`text-sm ${answer ? "" : "text-muted-foreground italic"}`}>
                          {answer || "Нет ответа"}
                        </p>
                      </div>
                    );
                  })
                ) : state?.pointB_answers ? (
                  Object.entries(state.pointB_answers).map(([key, value], idx) => (
                    <div key={key} className="border-b pb-3 last:border-0">
                      <Label className="text-muted-foreground">Шаг {idx + 1}</Label>
                      <p className="text-sm mt-1">{value || "—"}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Ответы не заполнены</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Completed Steps Summary */}
          {state?.completedSteps?.length ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" />
                  Пройденные блоки
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Завершено блоков: {state.completedSteps.length}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Text Answers (notes) */}
          {noteEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PenLine className="h-5 w-5 text-primary" />
                  Текстовые ответы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {noteEntries.map(([blockId, resp]: any) => {
                  const block = lessonBlocks.find(b => b.id === blockId);
                  const blockTitle = (block?.content as any)?.title || `Блок ${blockId.slice(0, 6)}`;
                  return (
                    <div key={blockId} className="border-b pb-3 last:border-0">
                      <Label className="font-medium text-sm">📌 {blockTitle}</Label>
                      <p className={`text-sm mt-1 ${resp.text ? "" : "text-muted-foreground italic"}`}>
                        {resp.text || "Нет ответа"}
                      </p>
                      {resp.saved_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Сохранено: {format(new Date(resp.saved_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Uploaded Files */}
          {uploadEntries.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-primary" />
                  Загруженные файлы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {uploadEntries.map(([blockId, resp]: any) => {
                  const block = lessonBlocks.find(b => b.id === blockId);
                  const blockTitle = (block?.content as any)?.title || `Блок ${blockId.slice(0, 6)}`;
                  const file = resp.file;
                  return (
                    <div key={blockId} className="flex items-center justify-between border-b pb-3 last:border-0">
                      <div>
                        <Label className="font-medium text-sm">📎 {blockTitle}</Label>
                        <p className="text-sm text-muted-foreground">{file.original_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ""}
                          {file.uploaded_at && ` • ${format(new Date(file.uploaded_at), "dd MMM yyyy", { locale: ru })}`}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(file.storage_path, file.original_name)}
                      >
                        Открыть
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* No data message */}
          {!state?.role && !state?.pointA_rows?.length && !state?.pointB_answers && noteEntries.length === 0 && uploadEntries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Ученик только начал прохождение</p>
              <p className="text-sm">Данные ещё не заполнены</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
