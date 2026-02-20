import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Globe, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Status = "loading" | "ok" | "error";

interface HealthResult {
  status: Status;
  latency?: number;
  baseUrl?: string;
  error?: string;
  enabled?: boolean;
}

export function ByEgressStatusBadge() {
  const [result, setResult] = useState<HealthResult>({ status: "loading" });
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setResult((prev) => ({ ...prev, status: "loading" }));

    try {
      // 1. Load hosterby config
      const { data: instances } = await supabase
        .from("integration_instances")
        .select("id, config")
        .eq("provider", "hosterby")
        .limit(1);

      const inst = instances?.[0];
      if (!inst) {
        setResult({ status: "error", error: "Интеграция hosterby не найдена", enabled: false });
        return;
      }

      const cfg = inst.config as Record<string, unknown>;
      const enabled = cfg?.egress_enabled === true;
      const baseUrl = (cfg?.egress_base_url as string) || "";

      if (!enabled) {
        setResult({ status: "error", error: "BY-egress выключен", enabled: false, baseUrl });
        return;
      }

      // 2. Health check via hosterby-api
      const t0 = Date.now();
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: { action: "by_egress_check_health", instance_id: inst.id },
      });
      const latency = Date.now() - t0;

      if (error) {
        setResult({ status: "error", error: String(error), enabled: true, baseUrl, latency });
        return;
      }

      if (data?.success) {
        setResult({ status: "ok", latency, baseUrl, enabled: true });
      } else {
        setResult({
          status: "error",
          error: data?.error || `HTTP ${data?.http_status}`,
          latency,
          baseUrl,
          enabled: true,
        });
      }
    } catch (e) {
      setResult({ status: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const dotColor =
    result.status === "ok"
      ? "bg-green-500"
      : result.status === "error"
        ? "bg-destructive"
        : "bg-muted-foreground";

  const borderColor =
    result.status === "ok"
      ? "border-green-500/30"
      : result.status === "error"
        ? "border-destructive/30"
        : "border-border";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${borderColor} bg-background cursor-default`}
          >
            {/* pulsing dot */}
            <span className="relative flex h-2 w-2">
              {result.status === "ok" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
            </span>

            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="text-foreground">IP BY</span>

            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 ml-0.5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                if (!checking) check();
              }}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
          <p className="font-semibold">
            BY-egress: {result.status === "ok" ? "работает ✅" : result.status === "error" ? "ошибка ❌" : "проверка…"}
          </p>
          {result.baseUrl && <p className="text-muted-foreground truncate">URL: {result.baseUrl}</p>}
          {result.latency != null && <p className="text-muted-foreground">Задержка: {result.latency} мс</p>}
          {result.error && <p className="text-destructive">{result.error}</p>}
          {result.enabled === false && <p className="text-muted-foreground">Включите egress в настройках hoster.by</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
