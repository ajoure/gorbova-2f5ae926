import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check, X, Network, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { IntegrationInstance } from "@/hooks/useIntegrations";

const DEFAULT_ALLOWLIST =
  "nbrb.by,nalog.gov.by,ssf.gov.by,kgk.gov.by,gtk.gov.by,minfin.gov.by,economy.gov.by,pravo.by,mintrud.gov.by,customs.gov.by";

interface HosterByEgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingInstance?: IntegrationInstance | null;
}

type Step = 1 | 2 | 3;

interface HealthCheckResult {
  success: boolean;
  http_status?: number;
  message?: string;
  error?: string;
}

interface TestUrlResult {
  success: boolean;
  http_status?: number;
  target_domain?: string;
  content_length?: string;
  error?: string;
}

export function HosterByEgressDialog({
  open,
  onOpenChange,
  existingInstance,
}: HosterByEgressDialogProps) {
  const existingConfig = existingInstance?.config ?? {};
  const existingBaseUrl = existingConfig.egress_base_url as string | undefined;
  const existingTokenLast4 = existingConfig.egress_token_last4 as string | undefined;
  const existingAllowlist = existingConfig.egress_allowlist as string | undefined;
  const existingEnabled = (existingConfig.egress_enabled as boolean | undefined) ?? true;

  const [step, setStep] = useState<Step>(1);

  // Step 1 fields
  const [baseUrl, setBaseUrl] = useState(existingBaseUrl || "");
  const [egressToken, setEgressToken] = useState("");
  const [allowlist, setAllowlist] = useState(existingAllowlist || DEFAULT_ALLOWLIST);

  // Step 2 state
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [testUrl, setTestUrl] = useState("https://nbrb.by");
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [testUrlResult, setTestUrlResult] = useState<TestUrlResult | null>(null);

  // Step 3 state
  const [egressEnabled, setEgressEnabled] = useState(existingEnabled);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<Record<string, unknown> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const queryClient = useQueryClient();

  const handleClose = () => {
    setStep(1);
    setHealthResult(null);
    setTestUrlResult(null);
    setDryRunResult(null);
    if (!existingBaseUrl) setBaseUrl("");
    setEgressToken("");
    onOpenChange(false);
  };

  const tokenToUse = egressToken.trim() || "";
  const effectiveToken =
    egressToken.trim() ||
    // If no new token entered and we have existing — signal to server to use existing
    (existingTokenLast4 ? "__USE_EXISTING__" : "");

  // ---- Step 1 → Step 2 ----
  const handleStep1Next = () => {
    if (!baseUrl.trim()) {
      toast.error("Введите BY_EGRESS_BASE_URL");
      return;
    }
    if (!egressToken.trim() && !existingTokenLast4) {
      toast.error("Введите токен fetch-service");
      return;
    }
    setStep(2);
  };

  // ---- Health check ----
  const handleHealthCheck = async () => {
    setIsCheckingHealth(true);
    setHealthResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "by_egress_check_health",
          instance_id: existingInstance?.id,
          payload: { base_url: baseUrl.trim() },
        },
      });

      if (error) {
        setHealthResult({ success: false, error: error.message });
        return;
      }
      setHealthResult(data as HealthCheckResult);
    } catch (err) {
      setHealthResult({ success: false, error: String(err) });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // ---- Test URL ----
  const handleTestUrl = async () => {
    if (!testUrl.trim()) {
      toast.error("Введите URL для теста");
      return;
    }

    setIsTestingUrl(true);
    setTestUrlResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "by_egress_test_url",
          instance_id: existingInstance?.id,
          payload: {
            base_url: baseUrl.trim(),
            token: egressToken.trim() || undefined, // undefined → server uses existing
            target_url: testUrl.trim(),
            allowlist: allowlist.trim(),
          },
        },
      });

      if (error) {
        setTestUrlResult({ success: false, error: error.message });
        return;
      }
      setTestUrlResult(data as TestUrlResult);
    } catch (err) {
      setTestUrlResult({ success: false, error: String(err) });
    } finally {
      setIsTestingUrl(false);
    }
  };

  // ---- Step 2 → Step 3 ----
  const handleStep2Next = () => {
    setStep(3);
  };

  // ---- Dry run ----
  const handleDryRun = async () => {
    if (!egressToken.trim() && !existingTokenLast4) {
      toast.error("Токен не задан");
      return;
    }

    setIsDryRunning(true);
    setDryRunResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "by_egress_save_config",
          dry_run: true,
          instance_id: existingInstance?.id,
          payload: {
            egress_base_url: baseUrl.trim(),
            egress_token: egressToken.trim() || undefined,
            egress_allowlist: allowlist.trim(),
            egress_enabled: egressEnabled,
          },
        },
      });

      if (error) {
        toast.error("Dry-run ошибка: " + error.message);
        return;
      }

      if (data?.success) {
        setDryRunResult(data.dry_run_result as Record<string, unknown>);
      } else {
        toast.error(data?.error || "Dry-run не прошёл");
      }
    } catch (err) {
      toast.error("Dry-run ошибка: " + String(err));
    } finally {
      setIsDryRunning(false);
    }
  };

  // ---- Save (execute) ----
  const handleSave = async () => {
    if (!dryRunResult) {
      toast.error("Сначала выполните dry-run");
      return;
    }

    setIsSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "by_egress_save_config",
          dry_run: false,
          instance_id: existingInstance?.id,
          payload: {
            egress_base_url: baseUrl.trim(),
            egress_token: egressToken.trim() || undefined,
            egress_allowlist: allowlist.trim(),
            egress_enabled: egressEnabled,
          },
        },
      });

      if (error || !data?.success) {
        toast.error("Ошибка сохранения: " + (data?.error || error?.message));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["integration-instances"] });
      toast.success("BY-egress конфиг сохранён");
      handleClose();
    } catch (err) {
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Настроить BY-egress (VPS)
          </DialogTitle>
          <DialogDescription>
            Подключите существующий VPS с установленным fetch-service для маршрутизации запросов к BY/RU сайтам.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 py-1">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : step > s
                    ? "bg-primary/30 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <Check className="h-3 w-3" /> : s}
              </div>
              {s < 3 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">
            {step === 1 ? "Параметры" : step === 2 ? "Тестирование" : "Сохранение"}
          </span>
        </div>

        {/* ---- STEP 1: Params ---- */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="egress_base_url">BY_EGRESS_BASE_URL</Label>
              <Input
                id="egress_base_url"
                placeholder="http://X.X.X.X:8080"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                IP-адрес и порт вашего VPS с fetch-service
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="egress_token">BY_EGRESS_TOKEN</Label>
              <Input
                id="egress_token"
                type="password"
                placeholder={existingTokenLast4 ? `Текущий: ••••${existingTokenLast4}` : "Bearer токен fetch-service"}
                value={egressToken}
                onChange={(e) => setEgressToken(e.target.value)}
                autoComplete="off"
              />
              {existingTokenLast4 && !egressToken && (
                <p className="text-xs text-muted-foreground">
                  Текущий: ••••{existingTokenLast4} — оставьте пустым, чтобы не менять
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="egress_allowlist">Allowlist доменов (через запятую)</Label>
              <Textarea
                id="egress_allowlist"
                placeholder={DEFAULT_ALLOWLIST}
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Только эти домены будут маршрутизироваться через VPS
              </p>
            </div>
          </div>
        )}

        {/* ---- STEP 2: Testing ---- */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            {/* Health check */}
            <div className="space-y-2">
              <Label>Проверка /health</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleHealthCheck}
                  disabled={isCheckingHealth}
                  className="flex-1"
                >
                  {isCheckingHealth ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Проверить /health
                </Button>
              </div>
              {healthResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    healthResult.success
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {healthResult.success ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {healthResult.message || healthResult.error}
                      {healthResult.http_status ? (
                        <Badge variant="secondary" className="ml-2">
                          HTTP {healthResult.http_status}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Test URL */}
            <div className="space-y-2">
              <Label>Тест URL через fetch-service</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://nbrb.by"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={handleTestUrl}
                  disabled={isTestingUrl || !testUrl.trim()}
                >
                  {isTestingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Тест"}
                </Button>
              </div>
              {testUrlResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    testUrlResult.success
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {testUrlResult.success ? (
                      <Check className="h-4 w-4 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 shrink-0" />
                    )}
                    {testUrlResult.http_status && (
                      <Badge variant="secondary">HTTP {testUrlResult.http_status}</Badge>
                    )}
                    {testUrlResult.target_domain && (
                      <Badge variant="outline">{testUrlResult.target_domain}</Badge>
                    )}
                    {testUrlResult.error && <span>{testUrlResult.error}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- STEP 3: Save ---- */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
              <div><span className="text-muted-foreground">URL:</span> {baseUrl}</div>
              <div>
                <span className="text-muted-foreground">Токен:</span>{" "}
                {egressToken ? `••••${egressToken.slice(-4)}` : existingTokenLast4 ? `••••${existingTokenLast4} (без изменений)` : "не задан"}
              </div>
              <div>
                <span className="text-muted-foreground">Allowlist:</span>{" "}
                <span className="break-all">{allowlist}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Switch
                id="egress_enabled"
                checked={egressEnabled}
                onCheckedChange={setEgressEnabled}
              />
              <div>
                <Label htmlFor="egress_enabled" className="font-medium cursor-pointer">
                  BY_EGRESS_ENABLED
                </Label>
                <p className="text-xs text-muted-foreground">
                  {egressEnabled
                    ? "Включён — запросы к allowlist-доменам идут через VPS"
                    : "Выключен — rollback к прямому fetch (без VPS)"}
                </p>
              </div>
            </div>

            {/* Dry run result */}
            {dryRunResult && (
              <div className="p-3 rounded-lg bg-primary/10 text-primary text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <Check className="h-4 w-4" />
                  Dry-run прошёл — конфигурация корректна
                </div>
                <div className="text-xs mt-1 space-y-0.5">
                  <div>URL: {dryRunResult.egress_base_url as string}</div>
                  <div>Токен: ••••{dryRunResult.egress_token_last4 as string}</div>
                  <div>Egress: {dryRunResult.egress_enabled ? "включён" : "выключен"}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDryRun}
                disabled={isDryRunning}
                className="flex-1"
              >
                {isDryRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Dry-run (предпросмотр)
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((step - 1) as Step)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Назад
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            {step < 3 ? (
              <Button
                onClick={step === 1 ? handleStep1Next : handleStep2Next}
              >
                Далее
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={isSaving || !dryRunResult}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Сохранить конфигурацию
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
