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
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Server, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { IntegrationInstance } from "@/hooks/useIntegrations";

interface HosterByConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingInstance?: IntegrationInstance | null;
}

// Masked display of last 4 chars
function maskKey(value: string | undefined): string {
  if (!value) return "не задан";
  return `••••${value.slice(-4)}`;
}

export function HosterByConnectionDialog({
  open,
  onOpenChange,
  existingInstance,
}: HosterByConnectionDialogProps) {
  // We NEVER pre-fill key fields from existing config — security rule
  const [cloudAccessKey, setCloudAccessKey] = useState("");
  const [cloudSecretKey, setCloudSecretKey] = useState("");
  const [dnsAccessKey, setDnsAccessKey] = useState("");
  const [dnsSecretKey, setDnsSecretKey] = useState("");
  const [showDns, setShowDns] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    vms_count?: number;
    cloud_access_key_last4?: string;
    cloud_secret_key_last4?: string;
    error?: string;
  } | null>(null);

  const queryClient = useQueryClient();

  const existingLast4AccessKey = existingInstance?.config?.cloud_access_key_last4 as string | undefined;
  const existingLast4SecretKey = existingInstance?.config?.cloud_secret_key_last4 as string | undefined;
  const keysConfigured = existingInstance?.config?.keys_configured as boolean | undefined;

  const handleValidate = async () => {
    if (!cloudAccessKey.trim() || !cloudSecretKey.trim()) {
      toast.error("Введите Cloud Access Key и Cloud Secret Key");
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // dry_run=true: validates keys WITHOUT saving
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "save_hoster_keys",
          dry_run: true,
          payload: {
            cloud_access_key: cloudAccessKey.trim(),
            cloud_secret_key: cloudSecretKey.trim(),
            ...(dnsAccessKey.trim() ? { dns_access_key: dnsAccessKey.trim() } : {}),
            ...(dnsSecretKey.trim() ? { dns_secret_key: dnsSecretKey.trim() } : {}),
          },
        },
      });

      if (error) {
        setValidationResult({ success: false, error: error.message });
        return;
      }

      if (data?.success) {
        setValidationResult({
          success: true,
          vms_count: data.vms_count ?? 0,
          cloud_access_key_last4: data.cloud_access_key_last4,
          cloud_secret_key_last4: data.cloud_secret_key_last4,
        });
        toast.success(`Ключи валидны! VM: ${data.vms_count ?? 0}`);
      } else {
        setValidationResult({ success: false, error: data?.error || "Ошибка проверки" });
      }
    } catch (err) {
      setValidationResult({
        success: false,
        error: err instanceof Error ? err.message : "Ошибка проверки",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    if (!validationResult?.success) {
      toast.error("Сначала проверьте ключи");
      return;
    }

    setIsSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke("hosterby-api", {
        body: {
          action: "save_hoster_keys",
          dry_run: false,
          instance_id: existingInstance?.id,
          payload: {
            cloud_access_key: cloudAccessKey.trim(),
            cloud_secret_key: cloudSecretKey.trim(),
            ...(dnsAccessKey.trim() ? { dns_access_key: dnsAccessKey.trim() } : {}),
            ...(dnsSecretKey.trim() ? { dns_secret_key: dnsSecretKey.trim() } : {}),
            alias: "hoster.by Cloud",
          },
        },
      });

      if (error || !data?.success) {
        toast.error("Ошибка сохранения: " + (data?.error || error?.message || "unknown"));
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["integration-instances"] });
      toast.success(existingInstance ? "Ключи обновлены" : "hoster.by подключён");
      onOpenChange(false);
      setCloudAccessKey("");
      setCloudSecretKey("");
      setDnsAccessKey("");
      setDnsSecretKey("");
      setValidationResult(null);
    } catch (err) {
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setCloudAccessKey("");
    setCloudSecretKey("");
    setDnsAccessKey("");
    setDnsSecretKey("");
    setValidationResult(null);
    onOpenChange(false);
  };

  const canValidate = cloudAccessKey.trim().length >= 8 && cloudSecretKey.trim().length >= 8;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {existingInstance ? "Обновить ключи hoster.by" : "Подключение hoster.by Cloud"}
          </DialogTitle>
          <DialogDescription>
            Ключи доступны в Личном кабинете hoster.by → Настройки → API.
            Значения не отображаются повторно — только последние 4 символа.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Cloud Access Key */}
          <div className="space-y-1.5">
            <Label htmlFor="cloud_access_key">Cloud Access Key</Label>
            <Input
              id="cloud_access_key"
              type="password"
              placeholder="Введите новый Cloud Access Key"
              value={cloudAccessKey}
              onChange={(e) => {
                setCloudAccessKey(e.target.value);
                setValidationResult(null);
              }}
              autoComplete="off"
            />
            {keysConfigured && existingLast4AccessKey && (
              <p className="text-xs text-muted-foreground">
                Текущий: {maskKey(existingLast4AccessKey)}
              </p>
            )}
          </div>

          {/* Cloud Secret Key */}
          <div className="space-y-1.5">
            <Label htmlFor="cloud_secret_key">Cloud Secret Key</Label>
            <Input
              id="cloud_secret_key"
              type="password"
              placeholder="Введите новый Cloud Secret Key"
              value={cloudSecretKey}
              onChange={(e) => {
                setCloudSecretKey(e.target.value);
                setValidationResult(null);
              }}
              autoComplete="off"
            />
            {keysConfigured && existingLast4SecretKey && (
              <p className="text-xs text-muted-foreground">
                Текущий: {maskKey(existingLast4SecretKey)}
              </p>
            )}
          </div>

          {/* Validate button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleValidate}
            disabled={isValidating || !canValidate}
          >
            {isValidating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Проверка...
              </>
            ) : (
              "Проверить подключение"
            )}
          </Button>

          {/* Validation result */}
          {validationResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                validationResult.success
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-start gap-2">
                {validationResult.success ? (
                  <>
                    <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-medium">Ключи валидны</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">VM: {validationResult.vms_count ?? 0}</Badge>
                        <Badge variant="secondary">
                          Access: ••••{validationResult.cloud_access_key_last4}
                        </Badge>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{validationResult.error}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* DNS Keys (future) */}
          <Collapsible open={showDns} onOpenChange={setShowDns}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                <span>DNS ключи (для будущего использования)</span>
                {showDns ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="dns_access_key" className="text-muted-foreground">DNS Access Key</Label>
                <Input
                  id="dns_access_key"
                  type="password"
                  placeholder="DNS Access Key (опционально)"
                  value={dnsAccessKey}
                  onChange={(e) => setDnsAccessKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dns_secret_key" className="text-muted-foreground">DNS Secret Key</Label>
                <Input
                  id="dns_secret_key"
                  type="password"
                  placeholder="DNS Secret Key (опционально)"
                  value={dnsSecretKey}
                  onChange={(e) => setDnsSecretKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                DNS ключи сохраняются, но пока не используются. Нужны для будущего управления DNS.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !validationResult?.success}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : existingInstance ? (
              "Обновить ключи"
            ) : (
              "Сохранить и подключить"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
