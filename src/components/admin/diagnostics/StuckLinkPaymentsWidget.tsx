import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StuckMetric {
  kind: string;
  status: string;
  cnt: number;
}

interface UnmaterializedOrder {
  order_id: string;
  order_status: string;
  tracking_id: string;
  bepaid_uid: string;
  created_at: string;
}

export function StuckLinkPaymentsWidget() {
  // Metric 1: payment_reconcile_queue with tracking_id LIKE 'link:%' and stuck statuses
  const { data: stuckMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["diagnostics", "stuck-link-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_reconcile_queue")
        .select("tracking_id, status")
        .like("tracking_id", "link:%")
        .in("status", ["pending", "error", "pending_needs_mapping"]);

      if (error) throw error;

      const groups: Record<string, number> = {};
      for (const row of data || []) {
        const tid = (row as any).tracking_id || "";
        const kind = tid.startsWith("link:order:") ? "link_order" : "link";
        const key = `${kind}|${row.status}`;
        groups[key] = (groups[key] || 0) + 1;
      }

      return Object.entries(groups).map(([key, cnt]) => {
        const [kind, status] = key.split("|");
        return { kind, status, cnt } as StuckMetric;
      });
    },
    refetchInterval: 60000,
  });

  // Metric 2: orders_v2 pending but have successful tx in queue
  const { data: unmaterialized, isLoading: unmaterializedLoading } = useQuery({
    queryKey: ["diagnostics", "unmaterialized-orders"],
    queryFn: async () => {
      const { data: queueData, error } = await supabase
        .from("payment_reconcile_queue")
        .select("tracking_id, status, bepaid_uid, status_normalized, created_at")
        .like("tracking_id", "link:%")
        .eq("status_normalized", "succeeded")
        .in("status", ["pending", "error", "pending_needs_mapping"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      if (!queueData || queueData.length === 0) return [];

      const results: UnmaterializedOrder[] = [];
      for (const q of queueData) {
        const tid = (q as any).tracking_id || "";
        let orderId: string | null = null;
        if (tid.startsWith("link:order:")) {
          orderId = tid.replace("link:order:", "");
        } else if (tid.startsWith("link:")) {
          orderId = tid.replace("link:", "");
        }

        if (orderId) {
          const { data: order } = await supabase
            .from("orders_v2")
            .select("id, status")
            .eq("id", orderId)
            .maybeSingle();

          if (order && order.status !== "paid") {
            results.push({
              order_id: order.id,
              order_status: order.status,
              tracking_id: tid,
              bepaid_uid: (q as any).bepaid_uid || "",
              created_at: (q as any).created_at || "",
            });
          }
        }
      }

      return results;
    },
    refetchInterval: 60000,
  });

  const totalStuck = stuckMetrics?.reduce((sum, m) => sum + m.cnt, 0) || 0;
  const totalUnmaterialized = unmaterialized?.length || 0;
  const isLoading = metricsLoading || unmaterializedLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Застрявшие link-платежи
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {totalStuck > 0 || totalUnmaterialized > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          )}
          Застрявшие link-платежи
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stuckMetrics && stuckMetrics.length > 0 ? (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Очередь (payment_reconcile_queue)</p>
            <div className="flex flex-wrap gap-2">
              {stuckMetrics.map((m) => (
                <Badge
                  key={`${m.kind}-${m.status}`}
                  variant={m.status === "error" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {m.kind} / {m.status}: {m.cnt}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Нет застрявших записей в очереди ✓</p>
        )}

        {totalUnmaterialized > 0 && (
          <div>
            <p className="text-xs text-destructive font-medium mb-2">
              ⚠️ Есть деньги, но не материализовано: {totalUnmaterialized}
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {unmaterialized!.map((u) => (
                <div key={u.bepaid_uid} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                  <span className="font-mono truncate max-w-[200px]" title={u.bepaid_uid}>
                    {u.bepaid_uid.slice(0, 8)}…
                  </span>
                  <span className="text-muted-foreground">
                    order: {u.order_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalStuck === 0 && totalUnmaterialized === 0 && (
          <p className="text-xs text-primary">Все link-платежи обработаны ✓</p>
        )}
      </CardContent>
    </Card>
  );
}
