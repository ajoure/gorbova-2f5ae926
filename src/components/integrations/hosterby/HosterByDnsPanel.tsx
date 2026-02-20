import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HosterByDnsRecordForm } from "./HosterByDnsRecordForm";

interface DnsOrder {
  id: string | number;
  name?: string;
  domain?: string;
  fqdn?: string;
  domain_name?: string;
  status?: string;
  nameservers?: string[];
  expire_date?: string;
  registration_date?: string;
}

interface DnsRecord {
  id?: string | number;
  name: string;
  type: string;
  content: string;
  ttl?: number;
  disabled?: boolean;
}

interface HosterByDnsPanelProps {
  instanceId: string;
}

export function HosterByDnsPanel({ instanceId }: HosterByDnsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [domains, setDomains] = useState<DnsOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, DnsRecord[]>>({});
  const [recordsLoading, setRecordsLoading] = useState<string | null>(null);

  const loadDomains = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "list_dns_orders", instance_id: instanceId },
      });
      if (error || !data?.success) {
        toast.error("Ошибка загрузки DNS: " + (data?.error || error?.message));
      } else {
        const payload = data.data;
        const orders: DnsOrder[] = payload?.orders || (Array.isArray(payload) ? payload : []);

        // Параллельно загружаем детали каждого заказа для получения доменного имени
        const enriched = await Promise.all(
          orders.map(async (order) => {
            try {
              const { data: detailData } = await supabase.functions.invoke("hosterby-api", {
                body: { action: "dns_order_detail", instance_id: instanceId, payload: { order_id: String(order.id) } },
              });
              if (detailData?.success && detailData.data) {
                return { ...order, ...detailData.data };
              }
            } catch {
              // fallback — используем данные из списка
            }
            return order;
          })
        );

        setDomains(enriched);
        setLoaded(true);
      }
    } catch {
      toast.error("Ошибка загрузки DNS");
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (orderId: string) => {
    if (expandedDomain === orderId) {
      setExpandedDomain(null);
      return;
    }
    setExpandedDomain(orderId);
    if (records[orderId]) return;

    setRecordsLoading(orderId);
    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "list_dns_records", instance_id: instanceId, payload: { order_id: orderId } },
      });
      if (error || !data?.success) {
        toast.error("Ошибка загрузки записей");
      } else {
        const payload = data.data;
        const recs = payload?.records || (Array.isArray(payload) ? payload : []);
        setRecords((prev) => ({ ...prev, [orderId]: recs }));
      }
    } catch {
      toast.error("Ошибка загрузки записей");
    } finally {
      setRecordsLoading(null);
    }
  };

  useEffect(() => {
    loadDomains();
  }, [instanceId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Домены</span>
          {loaded && <Badge variant="outline" className="text-xs">{domains.length}</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={loadDomains} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && !loaded && (
        <div className="text-sm text-muted-foreground text-center py-6">Загрузка доменов...</div>
      )}

      {loaded && domains.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Доменов не найдено</p>
          <p className="text-xs text-muted-foreground mt-1">Убедитесь, что DNS-ключи настроены корректно</p>
        </div>
      )}

      {domains.map((domain) => {
        const domainId = String(domain.id);
        const domainName = domain.name || domain.domain || domain.fqdn || domain.domain_name || `Домен #${domainId}`;
        const isExpanded = expandedDomain === domainId;
        const domainRecords = records[domainId] || [];

        return (
          <Card key={domainId} className="border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{domainName}</span>
                  {domain.status && (
                    <Badge variant="outline" className="text-xs">{domain.status}</Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => loadRecords(domainId)} className="h-7 px-2">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>

              {domain.nameservers && (
                <div className="text-xs text-muted-foreground">
                  NS: {domain.nameservers.join(", ")}
                </div>
              )}

              <div className="flex gap-4 text-xs text-muted-foreground">
                {domain.registration_date && <span>Рег: {domain.registration_date}</span>}
                {domain.expire_date && <span>Истекает: {domain.expire_date}</span>}
              </div>

              {isExpanded && (
                <div className="border-t pt-3 space-y-3">
                  {recordsLoading === domainId && (
                    <div className="text-xs text-muted-foreground text-center">Загрузка записей...</div>
                  )}

                  {domainRecords.length > 0 && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground px-2">
                        <span>Тип</span>
                        <span>Имя</span>
                        <span>Значение</span>
                        <span>TTL</span>
                      </div>
                      {domainRecords.map((rec, idx) => (
                        <div key={rec.id || idx} className="grid grid-cols-4 gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50">
                          <Badge variant="secondary" className="text-xs w-fit">{rec.type}</Badge>
                          <span className="truncate font-mono">{rec.name}</span>
                          <span className="truncate font-mono">{rec.content}</span>
                          <span>{rec.ttl || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <HosterByDnsRecordForm
                    instanceId={instanceId}
                    orderId={domainId}
                    onAdded={() => {
                      setRecords((prev) => ({ ...prev, [domainId]: [] }));
                      loadRecords(domainId);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
