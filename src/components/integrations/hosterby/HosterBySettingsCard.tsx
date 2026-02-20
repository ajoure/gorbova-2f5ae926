import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Server,
  Check,
  X,
  RefreshCw,
  Settings,
  Trash2,
  Network,
  ExternalLink,
  Cloud,
  Globe,
} from "lucide-react";
import { IntegrationInstance, useIntegrationMutations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { HosterByConnectionDialog } from "./HosterByConnectionDialog";
import { HosterByEgressDialog } from "./HosterByEgressDialog";
import { HosterByCloudPanel } from "./HosterByCloudPanel";
import { HosterByDnsPanel } from "./HosterByDnsPanel";
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

interface HosterBySettingsCardProps {
  instance: IntegrationInstance | null;
}

export function HosterBySettingsCard({ instance }: HosterBySettingsCardProps) {
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [egressDialogOpen, setEgressDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isTogglingEgress, setIsTogglingEgress] = useState(false);

  const queryClient = useQueryClient();
  const { deleteInstance } = useIntegrationMutations();

  const config = instance?.config ?? {};
  const isConnected = instance?.status === "connected";
  const hasError = instance?.status === "error";
  const keysConfigured = config.keys_configured as boolean | undefined;
  const vmsCount = config.vms_count as number | undefined;
  const accessKeyLast4 = config.cloud_access_key_last4 as string | undefined;

  // Egress state
  const egressEnabled = config.egress_enabled as boolean | undefined;
  const egressBaseUrl = config.egress_base_url as string | undefined;
  const egressTokenLast4 = config.egress_token_last4 as string | undefined;
  const egressConfigured = !!(egressBaseUrl && egressTokenLast4);

  const handleHealthCheck = async () => {
    if (!instance) return;
    setIsChecking(true);
    toast.info("Проверка подключения hoster.by...");
    try {
      const { data, error } = await supabase.functions.invoke("integration-healthcheck", {
        body: { provider: "hosterby", instance_id: instance.id },
      });
      queryClient.invalidateQueries({ queryKey: ["integration-instances"] });
      if (error) { toast.error(`Ошибка проверки: ${error.message}`); return; }
      if (data?.success) {
        const d = data.data ?? {};
        toast.success(`hoster.by подключён! VM: ${d.vms_count ?? 0}`);
      } else {
        toast.error(`Ошибка: ${data?.error || "Неизвестная ошибка"}`);
      }
    } catch { toast.error("Ошибка при проверке"); }
    finally { setIsChecking(false); }
  };

  const handleEgressToggle = async (enabled: boolean) => {
    if (!instance) return;
    setIsTogglingEgress(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "by_egress_toggle", instance_id: instance.id, payload: { enabled } },
      });
      if (error || !data?.success) { toast.error("Ошибка переключения egress: " + (data?.error || error?.message)); return; }
      queryClient.invalidateQueries({ queryKey: ["integration-instances"] });
      toast.success(enabled ? "BY-egress включён" : "BY-egress выключен");
    } catch { toast.error("Ошибка переключения egress"); }
    finally { setIsTogglingEgress(false); }
  };

  const handleDelete = async () => {
    if (!instance) return;
    try { await deleteInstance.mutateAsync(instance.id); setDeleteDialogOpen(false); } catch { /* handled */ }
  };

  const lastCheckFormatted = instance?.last_check_at
    ? new Date(instance.last_check_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isConnected ? "bg-primary/10" : "bg-muted"}`}>
                <Server className={`h-5 w-5 ${isConnected ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  hoster.by
                  {instance && (
                    <Badge variant={isConnected ? "default" : hasError ? "destructive" : "secondary"}>
                      {isConnected ? (<><Check className="h-3 w-3 mr-1" />Подключено</>) : hasError ? (<><X className="h-3 w-3 mr-1" />Ошибка</>) : "Не проверено"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-sm mt-1">
                  Управление хостингом hoster.by: Cloud VPS, DNS-записи, BY-egress.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {instance ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Обзор
                </TabsTrigger>
                <TabsTrigger value="cloud" className="flex-1" disabled={!keysConfigured}>
                  <Cloud className="h-3.5 w-3.5 mr-1.5" />
                  Cloud / VPS
                </TabsTrigger>
                <TabsTrigger value="dns" className="flex-1" disabled={!keysConfigured}>
                  <Globe className="h-3.5 w-3.5 mr-1.5" />
                  DNS
                </TabsTrigger>
              </TabsList>

              {/* ===== OVERVIEW TAB ===== */}
              <TabsContent value="overview" className="space-y-4">
                {/* Status grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Keys:</span>
                    {keysConfigured ? (
                      <span className="flex items-center gap-1 text-primary font-medium"><Check className="h-3 w-3" /> configured</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground"><X className="h-3 w-3" /> not set</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">API:</span>
                    {isConnected ? (
                      <span className="flex items-center gap-1 text-primary font-medium"><Check className="h-3 w-3" /> reachable</span>
                    ) : hasError ? (
                      <span className="flex items-center gap-1 text-destructive"><X className="h-3 w-3" /> error</span>
                    ) : (
                      <span className="text-muted-foreground">not checked</span>
                    )}
                  </div>
                  {accessKeyLast4 && (
                    <div><span className="text-muted-foreground">Access Key:</span><span className="ml-1.5 font-mono text-xs">••••{accessKeyLast4}</span></div>
                  )}
                  {typeof vmsCount === "number" && (
                    <div><span className="text-muted-foreground">VM:</span><span className="ml-1.5 font-medium">{vmsCount}</span></div>
                  )}
                  {lastCheckFormatted && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Last check:</span>
                      <span className="ml-1.5 text-xs">{lastCheckFormatted}</span>
                      <Badge variant={isConnected ? "outline" : "destructive"} className="ml-2 text-xs">{isConnected ? "OK" : "ERROR"}</Badge>
                    </div>
                  )}
                </div>

                {hasError && instance.error_message && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{instance.error_message}</div>
                )}

                {/* BY-egress section */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">BY-egress</span>
                      {egressConfigured ? (
                        <Badge variant={egressEnabled ? "default" : "secondary"} className="text-xs">{egressEnabled ? "Активен" : "Выключен"}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Не настроен</Badge>
                      )}
                    </div>
                    {egressConfigured && (
                      <Switch checked={!!egressEnabled} onCheckedChange={handleEgressToggle} disabled={isTogglingEgress} aria-label="Включить/выключить BY-egress" />
                    )}
                  </div>
                  {egressConfigured && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>URL: {egressBaseUrl}</div>
                      <div>Токен: ••••{egressTokenLast4}</div>
                      {egressEnabled ? (
                        <div className="text-primary">↗ Запросы к BY-доменам идут через VPS</div>
                      ) : (
                        <div className="text-muted-foreground">→ Прямой fetch (rollback активен)</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleHealthCheck} disabled={isChecking || !keysConfigured}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`} />Проверить
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConnectionDialogOpen(true)}>
                    <Settings className="h-4 w-4 mr-2" />Ключи API
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEgressDialogOpen(true)}>
                    <Network className="h-4 w-4 mr-2" />BY-egress
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href="https://cp.hoster.by" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />hoster.by
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-2" />Удалить
                  </Button>
                </div>
              </TabsContent>

              {/* ===== CLOUD TAB ===== */}
              <TabsContent value="cloud">
                <HosterByCloudPanel instanceId={instance.id} />
              </TabsContent>

              {/* ===== DNS TAB ===== */}
              <TabsContent value="dns">
                <HosterByDnsPanel instanceId={instance.id} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-4">
                Подключите hoster.by для управления Cloud VPS, DNS-записями и BY-egress
              </p>
              <Button onClick={() => setConnectionDialogOpen(true)}>
                <Server className="h-4 w-4 mr-2" />Подключить hoster.by
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <HosterByConnectionDialog open={connectionDialogOpen} onOpenChange={setConnectionDialogOpen} existingInstance={instance} />
      <HosterByEgressDialog open={egressDialogOpen} onOpenChange={setEgressDialogOpen} existingInstance={instance} />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подключение hoster.by?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Все ключи и конфиг BY-egress будут удалены. BY-egress маршрутизация немедленно прекратится.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
