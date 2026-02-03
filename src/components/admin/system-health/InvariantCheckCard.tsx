import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SystemHealthCheck, INVARIANT_INFO, CATEGORY_LABELS } from "@/hooks/useSystemHealthRuns";
import { CheckCircle, XCircle, ChevronDown, ExternalLink, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface InvariantCheckCardProps {
  check: SystemHealthCheck;
  variant: "success" | "error";
}

export function InvariantCheckCard({ check, variant }: InvariantCheckCardProps) {
  const [isOpen, setIsOpen] = useState(variant === "error");
  
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

  return (
    <Card className={variant === "error" ? "border-destructive/50 bg-destructive/5" : "border-border"}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-start gap-3">
              {variant === "error" ? (
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">
                    {title}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {invCode}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {category}
                  </Badge>
                  {check.count > 0 && (
                    <span className={`text-xs ${variant === "error" ? "text-destructive" : "text-muted-foreground"}`}>
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

            {/* Action Button */}
            {actionUrl && variant === "error" && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to={actionUrl}>
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Открыть для исправления
                </Link>
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
