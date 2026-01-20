import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, AlertCircle, Plus, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BepaidFullSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  defaultFromDate?: string;
}

interface ReconcileResult {
  ok: boolean;
  dry_run: boolean;
  period: { from_date: string; to_date: string };
  fetched: {
    bepaid_total: number;
    pages: number;
    cursor_next: string | null;
  };
  compared: { our_total: number };
  changes: {
    added: number;
    updated_amount: number;
    updated_status: number;
    updated_paid_at: number;
    unchanged: number;
    errors: number;
  };
  samples: {
    added: Array<{ uid: string; amount: number; status: string; paid_at: string }>;
    discrepancies_amount: Array<{ uid: string; our_amount: number; bepaid_amount: number; fixed: boolean }>;
    discrepancies_status: Array<{ uid: string; our_status: string; bepaid_status: string; fixed: boolean }>;
    discrepancies_paid_at: Array<{ uid: string; our_paid_at: string; bepaid_paid_at: string; fixed: boolean }>;
    errors: Array<{ uid: string; error: string }>;
  };
  error?: string;
}

export default function BepaidFullSyncDialog({ 
  open, 
  onOpenChange, 
  onComplete,
  defaultFromDate = "2026-01-01"
}: BepaidFullSyncDialogProps) {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isChecking, setIsChecking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [activeTab, setActiveTab] = useState("summary");

  const handleCheck = async () => {
    setIsChecking(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("admin-bepaid-full-reconcile", {
        body: {
          from_date: fromDate,
          to_date: toDate,
          dry_run: true,
        },
      });

      if (error) throw error;
      
      if (data.ok) {
        setResult(data);
        toast.success(`Найдено ${data.fetched.bepaid_total} транзакций на bePaid`);
      } else {
        toast.error(data.error || "Ошибка при проверке");
      }
    } catch (e: any) {
      console.error("Check error:", e);
      toast.error("Ошибка: " + (e.message || "Неизвестная ошибка"));
    } finally {
      setIsChecking(false);
    }
  };

  const handleExecute = async () => {
    if (!result) return;
    
    const totalChanges = result.changes.added + result.changes.updated_amount + result.changes.updated_status;
    if (totalChanges === 0) {
      toast.info("Нет изменений для применения");
      return;
    }

    setIsExecuting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("admin-bepaid-full-reconcile", {
        body: {
          from_date: fromDate,
          to_date: toDate,
          dry_run: false,
        },
      });

      if (error) throw error;
      
      if (data.ok) {
        setResult(data);
        const { added, updated_amount, updated_status, errors } = data.changes;
        toast.success(
          `Готово! Добавлено: ${added}, исправлено сумм: ${updated_amount}, статусов: ${updated_status}` +
          (errors > 0 ? `, ошибок: ${errors}` : "")
        );
        onComplete?.();
      } else {
        toast.error(data.error || "Ошибка при выполнении");
      }
    } catch (e: any) {
      console.error("Execute error:", e);
      toast.error("Ошибка: " + (e.message || "Неизвестная ошибка"));
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setActiveTab("summary");
    onOpenChange(false);
  };

  const totalChanges = result ? 
    result.changes.added + result.changes.updated_amount + result.changes.updated_status + result.changes.updated_paid_at : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Полная сверка с bePaid</DialogTitle>
          <DialogDescription>
            bePaid — источник истины. Добавляем недостающие платежи, исправляем суммы и статусы.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Date range inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-date">С даты</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={isChecking || isExecuting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-date">По дату</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                disabled={isChecking || isExecuting}
              />
            </div>
          </div>

          {/* Check button */}
          {!result && (
            <Button 
              onClick={handleCheck} 
              disabled={isChecking}
              className="w-full"
            >
              {isChecking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Проверяем...
                </>
              ) : (
                "Проверить"
              )}
            </Button>
          )}

          {/* Results */}
          {result && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold">{result.fetched.bepaid_total}</div>
                  <div className="text-xs text-muted-foreground">На bePaid</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold">{result.compared.our_total}</div>
                  <div className="text-xs text-muted-foreground">У нас</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.changes.added}</div>
                  <div className="text-xs text-muted-foreground">Добавить</div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {result.changes.updated_amount + result.changes.updated_status}
                  </div>
                  <div className="text-xs text-muted-foreground">Исправить</div>
                </div>
              </div>

              {/* Tabs with details */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="summary" className="gap-1">
                    Итого
                  </TabsTrigger>
                  <TabsTrigger value="added" className="gap-1">
                    <Plus className="h-3 w-3" />
                    {result.changes.added}
                  </TabsTrigger>
                  <TabsTrigger value="amounts" className="gap-1">
                    Суммы
                    <Badge variant="secondary" className="ml-1 h-5 px-1">
                      {result.changes.updated_amount}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="statuses" className="gap-1">
                    Статусы
                    <Badge variant="secondary" className="ml-1 h-5 px-1">
                      {result.changes.updated_status}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="errors" className="gap-1">
                    Ошибки
                    {result.changes.errors > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 px-1">
                        {result.changes.errors}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 mt-2">
                  <TabsContent value="summary" className="m-0 space-y-2">
                    <div className="p-4 rounded-lg border space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Период</span>
                        <span>{result.period.from_date} — {result.period.to_date}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Транзакций на bePaid</span>
                        <span className="font-medium">{result.fetched.bepaid_total}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Платежей у нас</span>
                        <span className="font-medium">{result.compared.our_total}</span>
                      </div>
                      <hr />
                      <div className="flex justify-between items-center text-green-600">
                        <span>Добавить новых</span>
                        <span className="font-bold">{result.changes.added}</span>
                      </div>
                      <div className="flex justify-between items-center text-yellow-600">
                        <span>Исправить суммы</span>
                        <span className="font-bold">{result.changes.updated_amount}</span>
                      </div>
                      <div className="flex justify-between items-center text-yellow-600">
                        <span>Исправить статусы</span>
                        <span className="font-bold">{result.changes.updated_status}</span>
                      </div>
                      <div className="flex justify-between items-center text-yellow-600">
                        <span>Исправить даты</span>
                        <span className="font-bold">{result.changes.updated_paid_at}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Без изменений</span>
                        <span>{result.changes.unchanged}</span>
                      </div>
                      {result.changes.errors > 0 && (
                        <div className="flex justify-between items-center text-red-600">
                          <span>Ошибки</span>
                          <span className="font-bold">{result.changes.errors}</span>
                        </div>
                      )}
                    </div>
                    
                    {result.dry_run && totalChanges > 0 && (
                      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
                        <span className="text-sm">
                          Это предварительный просмотр. Нажмите "Исправить всё" для применения изменений.
                        </span>
                      </div>
                    )}

                    {!result.dry_run && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm">Изменения применены успешно!</span>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="added" className="m-0">
                    {result.samples.added.length > 0 ? (
                      <div className="space-y-2">
                        {result.samples.added.map((item, idx) => (
                          <div key={idx} className="p-2 rounded border text-sm flex items-center justify-between">
                            <div className="space-y-1">
                              <code className="text-xs bg-muted px-1 rounded">{item.uid}</code>
                              <div className="text-muted-foreground text-xs">
                                {item.paid_at ? format(new Date(item.paid_at), "dd.MM.yyyy HH:mm") : "—"}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">{item.amount.toFixed(2)} BYN</div>
                              <Badge variant="outline" className="text-xs">{item.status}</Badge>
                            </div>
                          </div>
                        ))}
                        {result.changes.added > result.samples.added.length && (
                          <div className="text-center text-sm text-muted-foreground py-2">
                            ...и ещё {result.changes.added - result.samples.added.length}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Нет новых платежей для добавления
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="amounts" className="m-0">
                    {result.samples.discrepancies_amount.length > 0 ? (
                      <div className="space-y-2">
                        {result.samples.discrepancies_amount.map((item, idx) => (
                          <div key={idx} className="p-2 rounded border text-sm">
                            <code className="text-xs bg-muted px-1 rounded">{item.uid}</code>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-red-500 line-through">{item.our_amount.toFixed(2)}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span className="text-green-600 font-medium">{item.bepaid_amount.toFixed(2)} BYN</span>
                              {item.fixed && <CheckCircle className="h-3 w-3 text-green-600 ml-auto" />}
                            </div>
                          </div>
                        ))}
                        {result.changes.updated_amount > result.samples.discrepancies_amount.length && (
                          <div className="text-center text-sm text-muted-foreground py-2">
                            ...и ещё {result.changes.updated_amount - result.samples.discrepancies_amount.length}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Расхождений по суммам не найдено
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="statuses" className="m-0">
                    {result.samples.discrepancies_status.length > 0 ? (
                      <div className="space-y-2">
                        {result.samples.discrepancies_status.map((item, idx) => (
                          <div key={idx} className="p-2 rounded border text-sm">
                            <code className="text-xs bg-muted px-1 rounded">{item.uid}</code>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-red-500">{item.our_status}</Badge>
                              <ArrowRight className="h-3 w-3" />
                              <Badge variant="outline" className="text-green-600">{item.bepaid_status}</Badge>
                              {item.fixed && <CheckCircle className="h-3 w-3 text-green-600 ml-auto" />}
                            </div>
                          </div>
                        ))}
                        {result.changes.updated_status > result.samples.discrepancies_status.length && (
                          <div className="text-center text-sm text-muted-foreground py-2">
                            ...и ещё {result.changes.updated_status - result.samples.discrepancies_status.length}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        Расхождений по статусам не найдено
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="errors" className="m-0">
                    {result.samples.errors.length > 0 ? (
                      <div className="space-y-2">
                        {result.samples.errors.map((item, idx) => (
                          <div key={idx} className="p-2 rounded border border-red-200 bg-red-50 text-sm">
                            <code className="text-xs bg-muted px-1 rounded">{item.uid}</code>
                            <div className="text-red-600 mt-1 text-xs">{item.error}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        Ошибок нет
                      </div>
                    )}
                  </TabsContent>
                </ScrollArea>
              </Tabs>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t">
                <Button 
                  variant="outline" 
                  onClick={handleCheck}
                  disabled={isChecking || isExecuting}
                  className="flex-1"
                >
                  {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Проверить заново
                </Button>
                
                {result.dry_run && totalChanges > 0 && (
                  <Button 
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="flex-1"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Применяем...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Исправить всё ({totalChanges})
                      </>
                    )}
                  </Button>
                )}
                
                {!result.dry_run && (
                  <Button onClick={handleClose} className="flex-1">
                    Готово
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
