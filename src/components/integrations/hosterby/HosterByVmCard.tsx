import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RotateCcw, ChevronDown, ChevronUp, Cpu, MemoryStick, HardDrive, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

interface VmData {
  id: string | number;
  name: string;
  status: string;
  public_ip?: string;
  ip?: string;
  cpu?: number;
  ram?: number;
  os?: string;
}

interface HosterByVmCardProps {
  vm: VmData;
  instanceId: string;
  orderId: string;
  onRefresh: () => void;
}

export function HosterByVmCard({ vm, instanceId, orderId, onRefresh }: HosterByVmCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const isRunning = vm.status === "running" || vm.status === "on";
  const ip = vm.public_ip || vm.ip || "—";

  const executeAction = async (action: string) => {
    setLoading(action);
    setConfirmAction(null);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action, instance_id: instanceId, payload: { order_id: orderId, vm_id: String(vm.id) } },
      });
      if (error || !data?.success) {
        toast.error(`Ошибка ${action}: ${data?.error || error?.message}`);
      } else {
        const labels: Record<string, string> = {
          vm_start: "VM запускается",
          vm_stop: "VM останавливается",
          vm_reboot: "VM перезагружается",
          vm_reset: "VM сброшена (hard reset)",
          vm_shutdown: "VM выключается (soft)",
        };
        toast.success(labels[action] || "Команда отправлена");
        setTimeout(onRefresh, 3000);
      }
    } catch {
      toast.error("Ошибка выполнения команды");
    } finally {
      setLoading(null);
    }
  };

  const handleDestructive = (action: string) => {
    setConfirmAction(action);
  };

  const loadDetail = async () => {
    if (detail) { setExpanded(!expanded); return; }
    setExpanded(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "vm_detail", instance_id: instanceId, payload: { order_id: orderId, vm_id: String(vm.id) } },
      });
      if (error || !data?.success) {
        toast.error("Не удалось загрузить детали VM");
      } else {
        setDetail(data.data as Record<string, unknown>);
      }
    } catch {
      toast.error("Ошибка загрузки");
    }
  };

  const confirmLabels: Record<string, { title: string; desc: string }> = {
    vm_stop: { title: "Остановить VM?", desc: "VM будет остановлена. Запущенные процессы могут потерять данные." },
    vm_reset: { title: "Жёсткий сброс VM?", desc: "Это эквивалент выдёргивания кабеля питания. Используйте только если VM не отвечает." },
    vm_shutdown: { title: "Выключить VM (soft)?", desc: "ОС получит сигнал завершения. Более безопасно, чем stop/reset." },
  };

  return (
    <>
      <Card className="border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{vm.name || `VM #${vm.id}`}</span>
              <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
                {isRunning ? "Работает" : vm.status || "Выключена"}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={loadDetail} className="h-7 px-2">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {ip !== "—" && (
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{ip}</span>
            )}
            {vm.cpu && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{vm.cpu} vCPU</span>}
            {vm.ram && <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{vm.ram} MB</span>}
            {vm.os && <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{vm.os}</span>}
          </div>

          <div className="flex gap-2">
            {!isRunning && (
              <Button variant="outline" size="sm" disabled={!!loading} onClick={() => executeAction("vm_start")}>
                <Play className="h-3.5 w-3.5 mr-1" />
                {loading === "vm_start" ? "..." : "Запустить"}
              </Button>
            )}
            {isRunning && (
              <>
                <Button variant="outline" size="sm" disabled={!!loading} onClick={() => executeAction("vm_reboot")}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  {loading === "vm_reboot" ? "..." : "Перезагрузить"}
                </Button>
                <Button variant="outline" size="sm" disabled={!!loading} onClick={() => handleDestructive("vm_shutdown")}>
                  <Square className="h-3.5 w-3.5 mr-1" />
                  {loading === "vm_shutdown" ? "..." : "Выключить"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={!!loading}
                  onClick={() => handleDestructive("vm_stop")}
                >
                  {loading === "vm_stop" ? "..." : "Force Stop"}
                </Button>
              </>
            )}
          </div>

          {expanded && detail && (
            <div className="border-t pt-3 mt-2 space-y-1 text-xs text-muted-foreground">
              {detail.disk && <div>Диск: {String(detail.disk)} GB</div>}
              {detail.traffic && <div>Трафик: {String(detail.traffic)}</div>}
              {detail.cost_per_hour !== undefined && <div>Стоимость: {String(detail.cost_per_hour)} BYN/час</div>}
              {detail.created_at && <div>Создана: {String(detail.created_at)}</div>}
              {detail.template && <div>Шаблон: {String(detail.template)}</div>}
              {/* Raw fallback for unknown fields */}
              {!detail.disk && !detail.traffic && (
                <pre className="text-xs overflow-auto max-h-32">{JSON.stringify(detail, null, 2)}</pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmLabels[confirmAction ?? ""]?.title ?? "Подтвердите действие"}</AlertDialogTitle>
            <AlertDialogDescription>{confirmLabels[confirmAction ?? ""]?.desc ?? ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmAction && executeAction(confirmAction)}
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
