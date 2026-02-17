import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SystemHealthCheck, INVARIANT_INFO, CATEGORY_LABELS, IgnoredCheck, useUnignoreCheck } from "@/hooks/useSystemHealthRuns";
import { CheckCircle, XCircle, ChevronDown, ExternalLink, AlertTriangle, EyeOff, Undo2, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { IgnoreCheckDialog } from "./IgnoreCheckDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InvariantCheckCardProps {
  check: SystemHealthCheck;
  variant: "success" | "error" | "ignored";
  isSuperAdmin?: boolean;
  ignoredInfo?: IgnoredCheck;
}

export function InvariantCheckCard({ check, variant, isSuperAdmin, ignoredInfo }: InvariantCheckCardProps) {
  const [isOpen, setIsOpen] = useState(variant === "error");
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [actionFnLoading, setActionFnLoading] = useState(false);
  const [actionFnDryResult, setActionFnDryResult] = useState<any>(null);
  const unignoreCheck = useUnignoreCheck();
  
  // Extract invariant code from check_key (e.g., "INV-2A" from "INV-2A: No business payments...")
  const invCode = check.check_key?.split(":")[0]?.trim() || check.check_key;
  const info = INVARIANT_INFO[invCode];

  const title = info?.title || check.check_name || invCode;
  const explain = info?.explain || (check.details as any)?.description || "";
  const action = info?.action || "";
  const category = CATEGORY_LABELS[check.category] || check.category;

  // Build URL with sample data if available
  const buildUrl = () => {
    if (!info?.urlTemplate) return null;
    let url = info.urlTemplate;
    
    // Replace placeholders with sample data
    const samples = check.sample_rows || [];
    if (samples.length > 0) {
      const sample = samples[0];
      url = url.replace("{payment_id}", sample.payment_id || sample.id || "");
      url = url.replace("{order_id}", sample.order_id || "");
      url = url.replace("{product_id}", sample.product_id || sample.tariff_id || "");
    }
    
    return url;
  };

  const actionUrl = buildUrl();

  // Determine card styling based on variant
  const getCardClasses = () => {
    if (variant === "ignored") {
      return "border-warning/50 bg-warning/5";
    }
    if (variant === "error") {
      return "border-destructive/50 bg-destructive/5";
    }
    return "border-border";
  };

  const handleUnignore = async () => {
    if (ignoredInfo?.id) {
      await unignoreCheck.mutateAsync(ignoredInfo.id);
    }
  };

  return (
    <>
      <Card className={getCardClasses()}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-start gap-3">
                {variant === "ignored" ? (
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                ) : variant === "error" ? (
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-medium">
                      {title}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {invCode}
                    </Badge>
                    {variant === "ignored" && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-warning/20 text-warning-foreground">
                        Игнорируется
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {category}
                    </Badge>
                    {check.count > 0 && (
                      <span className={`text-xs ${
                        variant === "error" ? "text-destructive" : 
                        variant === "ignored" ? "text-warning-foreground" : 
                        "text-muted-foreground"
                      }`}>
                        {check.count} найдено
                      </span>
                    )}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 space-y-3">
              {/* Ignored Info */}
              {variant === "ignored" && ignoredInfo && (
                <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm space-y-1">
                  <p className="font-medium text-warning-foreground">
                    Причина игнорирования:
                  </p>
                  <p className="text-foreground">{ignoredInfo.reason}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                    <span>
                      {ignoredInfo.expires_at 
                        ? `До: ${format(new Date(ignoredInfo.expires_at), "PPP", { locale: ru })}`
                        : "Постоянно"
                      }
                    </span>
                    <span>
                      Создано: {format(new Date(ignoredInfo.ignored_at), "PPP", { locale: ru })}
                    </span>
                  </div>
                </div>
              )}

              {/* Explanation */}
              {explain && (
                <div className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Проблема:</strong> {explain}
                </div>
              )}

              {/* Action */}
              {action && (
                <div className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Действие:</strong> {action}
                </div>
              )}

              {/* Samples */}
              {check.sample_rows && check.sample_rows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Примеры ({Math.min(check.sample_rows.length, 5)} из {check.count}):
                  </div>
                  <div className="bg-muted/50 rounded-md p-2 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto">
                    {check.sample_rows.slice(0, 5).map((sample, idx) => (
                      <div key={idx} className="py-1 border-b border-border/50 last:border-0">
                        {Object.entries(sample).slice(0, 4).map(([key, value]) => (
                          <span key={key} className="mr-3">
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            <span className="text-foreground">{String(value)}</span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Open for fix button */}
                {actionUrl && variant === "error" && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={actionUrl}>
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Открыть для исправления
                    </Link>
                  </Button>
                )}

                {/* Ignore button - only for super_admin on error variant */}
                {variant === "error" && isSuperAdmin && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIgnoreDialogOpen(true);
                    }}
                    className="border-warning/50 text-warning-foreground hover:bg-warning/10"
                  >
                    <EyeOff className="h-3.5 w-3.5 mr-2" />
                    Игнорировать
                  </Button>
                )}

                {/* Unignore button - only for super_admin on ignored variant */}
                {variant === "ignored" && isSuperAdmin && ignoredInfo && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleUnignore}
                    disabled={unignoreCheck.isPending}
                  >
                    {unignoreCheck.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Undo2 className="h-3.5 w-3.5 mr-2" />
                    )}
                    Отменить игнорирование
                  </Button>
                )}

                {/* PATCH P2.5: Action function button (only for INV-17 sync pending) */}
                {info?.actionFn && variant === "error" && isSuperAdmin && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={actionFnLoading}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setActionFnLoading(true);
                      try {
                        if (!actionFnDryResult) {
                          const { data, error } = await supabase.functions.invoke(info.actionFn!, {
                            body: { dry_run: true, mode: "stale_or_missing", max_age_days: 7, limit: 200 },
                          });
                          if (error) throw error;
                          setActionFnDryResult(data);
                          toast.info(`Найдено ${data.candidates_found} записей`, {
                            description: "Нажмите ещё раз для выполнения",
                          });
                        } else {
                          const { data, error } = await supabase.functions.invoke(info.actionFn!, {
                            body: { dry_run: false, mode: "stale_or_missing", max_age_days: 7, limit: 200, batch_size: 20 },
                          });
                          if (error) throw error;
                          toast.success(`Выполнено: ${data.synced} синхронизировано`, {
                            description: `Active: ${data.became_active}, Canceled: ${data.became_canceled}`,
                          });
                          setActionFnDryResult(null);
                        }
                      } catch (err: any) {
                        toast.error("Ошибка", { description: err.message });
                        setActionFnDryResult(null);
                      } finally {
                        setActionFnLoading(false);
                      }
                    }}
                  >
                    {actionFnLoading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 mr-2" />
                    )}
                    {actionFnDryResult ? "Выполнить" : "Запустить"}
                  </Button>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Ignore Dialog */}
      <IgnoreCheckDialog
        open={ignoreDialogOpen}
        onOpenChange={setIgnoreDialogOpen}
        checkKey={invCode}
        checkName={title}
      />
    </>
  );
}
