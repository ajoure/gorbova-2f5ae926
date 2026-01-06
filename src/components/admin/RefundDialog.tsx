import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  onSuccess?: () => void;
}

export function RefundDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  amount,
  currency,
  onSuccess,
}: RefundDialogProps) {
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState(amount);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRefund = async () => {
    if (!reason.trim()) {
      toast.error("Укажите причину возврата");
      return;
    }

    if (refundAmount <= 0 || refundAmount > amount) {
      toast.error("Некорректная сумма возврата");
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("subscription-admin-actions", {
        body: {
          action: "refund",
          order_id: orderId,
          refund_amount: refundAmount,
          refund_reason: reason.trim(),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      toast.success("Возврат оформлен");
      setReason("");
      setRefundAmount(amount);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Refund error:", error);
      toast.error("Ошибка возврата: " + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAmount = (val: number) => {
    return new Intl.NumberFormat("ru-BY", {
      style: "currency",
      currency,
    }).format(val);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Возврат средств
          </DialogTitle>
          <DialogDescription>
            Заказ {orderNumber} • Сумма: {formatAmount(amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Возврат будет записан в историю. Убедитесь, что причина указана корректно.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-amount">Сумма возврата</Label>
            <Input
              id="refund-amount"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
              max={amount}
              min={0.01}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">
              Максимум: {formatAmount(amount)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-reason">
              Причина возврата <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Опишите причину возврата..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={handleRefund}
            disabled={isProcessing || !reason.trim()}
            className="w-full sm:w-auto"
          >
            {isProcessing ? "Обработка..." : `Вернуть ${formatAmount(refundAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
