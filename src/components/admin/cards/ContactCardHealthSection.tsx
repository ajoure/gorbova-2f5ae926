import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { CardHealthBadge } from "./CardHealthBadge";

interface ContactCardHealthSectionProps {
  userId: string;
  contactId: string;
  canReverify?: boolean;
}

interface PaymentMethodWithHealth {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  provider: string;
  status: string;
  is_default: boolean;
  verification_status: string | null;
  supports_recurring: boolean | null;
  recurring_verified: boolean | null;
  verification_error: string | null;
  verification_checked_at: string | null;
}

interface VerificationJob {
  id: string;
  payment_method_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  updated_at: string;
}

export function ContactCardHealthSection({
  userId,
  contactId,
  canReverify = false,
}: ContactCardHealthSectionProps) {
  const queryClient = useQueryClient();
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);

  // Fetch payment methods with health fields
  const { data: paymentMethods, isLoading: methodsLoading } = useQuery({
    queryKey: ["card-health-methods", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select(`
          id, brand, last4, exp_month, exp_year, provider, status, is_default,
          verification_status, supports_recurring, recurring_verified,
          verification_error, verification_checked_at
        `)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data as PaymentMethodWithHealth[];
    },
    enabled: !!userId,
  });

  // Fetch latest verification jobs for all payment methods
  const { data: verificationJobs } = useQuery({
    queryKey: ["card-verification-jobs", userId],
    queryFn: async () => {
      if (!paymentMethods || paymentMethods.length === 0) return {};

      const methodIds = paymentMethods.map((m) => m.id);
      const { data, error } = await supabase
        .from("payment_method_verification_jobs")
        .select("id, payment_method_id, status, attempt_count, last_error, updated_at")
        .in("payment_method_id", methodIds)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Group by payment_method_id, take latest per method
      const jobsMap: Record<string, VerificationJob> = {};
      for (const job of data || []) {
        if (!jobsMap[job.payment_method_id]) {
          jobsMap[job.payment_method_id] = job as VerificationJob;
        }
      }
      return jobsMap;
    },
    enabled: !!paymentMethods && paymentMethods.length > 0,
  });

  // Count errors in last 48h
  const { data: recentErrorsCount } = useQuery({
    queryKey: ["card-errors-48h", userId],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("payment_method_verification_jobs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("updated_at", cutoff)
        .or("status.eq.failed,status.eq.rejected,last_error.neq.null");

      if (error) return 0;
      return count || 0;
    },
    enabled: !!userId,
  });

  // Reverify mutation with SYSTEM ACTOR audit
  const reverifyMutation = useMutation({
    mutationFn: async (methodId: string) => {
      // 1. Guard: check for existing pending/processing job
      const { data: existingJob, error: checkError } = await supabase
        .from("payment_method_verification_jobs")
        .select("id, status")
        .eq("payment_method_id", methodId)
        .in("status", ["pending", "processing", "rate_limited"])
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingJob) {
        throw new Error("Карта уже в очереди на проверку");
      }

      // 2. Get current admin user for meta
      const { data: { user } } = await supabase.auth.getUser();
      const adminUserId = user?.id || null;

      // 3. Create verification job with idempotency key
      const idempotencyKey = `admin_reverify_${methodId}_${Date.now()}`;
      const { error: insertError } = await supabase
        .from("payment_method_verification_jobs")
        .insert({
          payment_method_id: methodId,
          user_id: userId,
          status: "pending",
          attempt_count: 0,
          max_attempts: 3,
          idempotency_key: idempotencyKey,
        });

      if (insertError) throw insertError;

      // 4. Update payment_methods.verification_status to pending
      const { error: updateError } = await supabase
        .from("payment_methods")
        .update({ verification_status: "pending" })
        .eq("id", methodId);

      if (updateError) {
        console.warn("Failed to update verification_status:", updateError);
      }

      // 5. SYSTEM ACTOR audit log
      const { error: auditError } = await supabase.from("audit_logs").insert({
        actor_type: "system",
        actor_user_id: null,
        actor_label: "admin-ui",
        action: "card.reverify.requested",
        target_user_id: userId,
        meta: {
          payment_method_id: methodId,
          contact_id: contactId,
          triggered_by_admin: adminUserId,
          source: "contact_detail_sheet",
          idempotency_key: idempotencyKey,
        },
      });

      if (auditError) {
        console.warn("Audit log insert error:", auditError);
      }

      return { methodId };
    },
    onSuccess: () => {
      toast.success("Карта добавлена в очередь на проверку");
      queryClient.invalidateQueries({ queryKey: ["card-health-methods", userId] });
      queryClient.invalidateQueries({ queryKey: ["card-verification-jobs", userId] });
      queryClient.invalidateQueries({ queryKey: ["card-errors-48h", userId] });
    },
    onError: (error: Error) => {
      toast.error("Ошибка: " + error.message);
    },
    onSettled: () => {
      setReverifyingId(null);
    },
  });

  const handleReverify = async (methodId: string) => {
    setReverifyingId(methodId);
    reverifyMutation.mutate(methodId);
  };

  const canReverifyCard = (method: PaymentMethodWithHealth) => {
    const status = method.verification_status?.toLowerCase();
    return (
      canReverify &&
      (status === "rejected" || status === "failed" || !status)
    );
  };

  const isJobActive = (methodId: string) => {
    const job = verificationJobs?.[methodId];
    if (!job) return false;
    return ["pending", "processing", "rate_limited"].includes(job.status);
  };

  if (methodsLoading) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Статус карт (Card Health)
          </CardTitle>
        </CardHeader>
        <CardContent className="py-0 pb-3 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!paymentMethods || paymentMethods.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            Статус карт (Card Health)
          </CardTitle>
        </CardHeader>
        <CardContent className="py-0 pb-3">
          <p className="text-sm text-muted-foreground">Нет активных карт</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Статус карт (Card Health)
          </CardTitle>
          {recentErrorsCount !== undefined && recentErrorsCount > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="w-3 h-3" />
              Ошибки за 48ч: {recentErrorsCount}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-0 pb-3 space-y-3">
        {paymentMethods.map((method) => {
          const job = verificationJobs?.[method.id];
          const isActive = isJobActive(method.id);
          const showReverify = canReverifyCard(method) && !isActive;

          return (
            <div
              key={method.id}
              className="border rounded-lg p-3 space-y-2 bg-background"
            >
              {/* Card header: brand/last4/exp/provider */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {method.brand?.toUpperCase() || "CARD"} ****{method.last4 || "????"}
                  </span>
                  {method.exp_month && method.exp_year && (
                    <span className="text-xs text-muted-foreground">
                      до {String(method.exp_month).padStart(2, "0")}/{String(method.exp_year).slice(-2)}
                    </span>
                  )}
                  {method.is_default && (
                    <Badge variant="secondary" className="text-xs">
                      Основная
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{method.provider}</span>
              </div>

              {/* Health badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <CardHealthBadge
                  verificationStatus={method.verification_status}
                  supportsRecurring={method.supports_recurring}
                  recurringVerified={method.recurring_verified}
                  verificationError={method.verification_error}
                  verificationCheckedAt={method.verification_checked_at}
                />
              </div>

              {/* Verification error details */}
              {method.verification_error && (
                <p className="text-xs text-destructive">
                  Причина: {method.verification_error}
                </p>
              )}

              {/* Last job info */}
              {job && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>
                    Последняя проверка:{" "}
                    {format(new Date(job.updated_at), "dd.MM.yy HH:mm", { locale: ru })}
                  </span>
                  <span>•</span>
                  <span>Попыток: {job.attempt_count}</span>
                  {job.last_error && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs cursor-help">
                            Ошибка
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          {job.last_error}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}

              {/* Reverify button */}
              {showReverify && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReverify(method.id)}
                  disabled={reverifyingId === method.id}
                  className="mt-1"
                >
                  {reverifyingId === method.id ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Перепроверить
                </Button>
              )}

              {isActive && (
                <Badge variant="outline" className="text-xs gap-1 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  В очереди ({job?.status})
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
