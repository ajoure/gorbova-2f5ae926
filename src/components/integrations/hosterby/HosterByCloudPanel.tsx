import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wallet, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HosterByVmCard } from "./HosterByVmCard";

interface HosterByCloudPanelProps {
  instanceId: string;
}

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

export function HosterByCloudPanel({ instanceId }: HosterByCloudPanelProps) {
  const [loading, setLoading] = useState(false);
  const [vms, setVms] = useState<VmData[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [balance, setBalance] = useState<Record<string, unknown> | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadVms = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "list_vms", instance_id: instanceId },
      });
      if (error || !data?.success) {
        toast.error("Ошибка загрузки VM: " + (data?.error || error?.message));
      } else {
        setVms(data.vms || []);
        setOrderId(data.cloud_id_used || null);
        setLoaded(true);
      }
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const loadBalance = async () => {
    setBalanceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "cloud_balance", instance_id: instanceId },
      });
      if (error || !data?.success) {
        toast.error("Ошибка загрузки баланса");
      } else {
        setBalance(data.data as Record<string, unknown>);
      }
    } catch {
      toast.error("Ошибка загрузки баланса");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    loadVms();
    loadBalance();
  }, [instanceId]);

  return (
    <div className="space-y-4">
      {/* Balance section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Баланс</span>
          {balance && (
            <Badge variant="outline" className="text-xs font-mono">
              {typeof balance.balance === "number"
                ? `${balance.balance.toFixed(2)} BYN`
                : typeof balance.amount === "number"
                  ? `${balance.amount.toFixed(2)} BYN`
                  : JSON.stringify(balance)}
            </Badge>
          )}
          {balanceLoading && <span className="text-xs text-muted-foreground">загрузка...</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => { loadVms(); loadBalance(); }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* VM list */}
      {loading && !loaded && (
        <div className="text-sm text-muted-foreground text-center py-6">Загрузка виртуальных машин...</div>
      )}

      {loaded && vms.length === 0 && (
        <div className="text-center py-6 space-y-2">
          <Server className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Виртуальных машин не найдено</p>
          <p className="text-xs text-muted-foreground">
            Создайте VM в{" "}
            <a href="https://cp.hoster.by" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              панели hoster.by
            </a>
            , и она появится здесь автоматически.
          </p>
        </div>
      )}

      {vms.length > 0 && orderId && (
        <div className="space-y-3">
          {vms.map((vm) => (
            <HosterByVmCard
              key={String(vm.id)}
              vm={vm}
              instanceId={instanceId}
              orderId={orderId}
              onRefresh={loadVms}
            />
          ))}
        </div>
      )}
    </div>
  );
}
