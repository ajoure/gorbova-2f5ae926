import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserMinus, AlertTriangle } from "lucide-react";

interface UnlinkContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  rawSource: 'queue' | 'payments_v2';
  cardLast4?: string | null;
  profileId: string;
  profileName?: string | null;
  onSuccess: () => void;
}

export function UnlinkContactDialog({
  open,
  onOpenChange,
  paymentId,
  rawSource,
  cardLast4,
  profileId,
  profileName,
  onSuccess,
}: UnlinkContactDialogProps) {
  const [unlinkFromAll, setUnlinkFromAll] = useState(false);
  const [unlinkingCard, setUnlinkingCard] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleUnlink = async () => {
    setLoading(true);
    try {
      if (unlinkFromAll && cardLast4) {
        // Unlink from all payments with this card
        // 1. Remove card from card_profile_links
        await supabase
          .from("card_profile_links")
          .delete()
          .eq("card_last4", cardLast4)
          .eq("profile_id", profileId);

        // 2. Unlink all queue items with this card
        const { error: queueError } = await supabase
          .from("payment_reconcile_queue")
          .update({ matched_profile_id: null })
          .eq("card_last4", cardLast4)
          .eq("matched_profile_id", profileId);
        
        if (queueError) console.warn("Queue unlink error:", queueError);

        // 3. Unlink all payments_v2 with this card
        const { error: paymentsError } = await supabase
          .from("payments_v2")
          .update({ profile_id: null })
          .eq("card_last4", cardLast4)
          .eq("profile_id", profileId);
        
        if (paymentsError) console.warn("Payments unlink error:", paymentsError);

        toast.success(`Контакт отвязан от всех платежей с картой ****${cardLast4}`);
      } else {
        // Unlink only this payment
        if (rawSource === 'queue') {
          const { error } = await supabase
            .from("payment_reconcile_queue")
            .update({ matched_profile_id: null })
            .eq("id", paymentId);
          
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("payments_v2")
            .update({ profile_id: null })
            .eq("id", paymentId);
          
          if (error) throw error;
        }
        
        toast.success("Контакт отвязан");
      }

      // Also unlink card from card_profile_links if checkbox is checked
      if (unlinkingCard && cardLast4) {
        await supabase
          .from("card_profile_links")
          .delete()
          .eq("card_last4", cardLast4)
          .eq("profile_id", profileId);
      }

      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <UserMinus className="h-5 w-5 text-destructive" />
            </div>
            Отвязать контакт
          </AlertDialogTitle>
          <AlertDialogDescription>
            Вы уверены, что хотите отвязать контакт{" "}
            <strong>{profileName || "Без имени"}</strong> от этого платежа?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {cardLast4 && (
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="unlink-from-all"
                  checked={unlinkFromAll}
                  onCheckedChange={(checked) => setUnlinkFromAll(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="unlink-from-all" className="font-medium cursor-pointer">
                    Отвязать от всех платежей с этой картой
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Будут отвязаны все платежи с картой ****{cardLast4}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="unlink-card"
                  checked={unlinkingCard}
                  onCheckedChange={(checked) => setUnlinkingCard(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="unlink-card" className="font-medium cursor-pointer">
                    Удалить связь карты с контактом
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Новые платежи с этой картой не будут автоматически привязаны к контакту
                  </p>
                </div>
              </div>
            </>
          )}

          {unlinkFromAll && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Это действие отвяжет контакт от всех платежей с данной картой
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleUnlink}
            disabled={loading}
            className="bg-destructive hover:bg-destructive/90"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Отвязать
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
