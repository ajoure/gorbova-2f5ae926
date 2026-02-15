import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Copy, ExternalLink, Loader2, Package, Tag, CheckCircle, Send } from "lucide-react";
import { useProductsV2, useTariffs } from "@/hooks/useProductsV2";
import { copyToClipboard } from "@/utils/clipboardUtils";

interface AdminPaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName?: string;
  userEmail?: string;
  telegramUserId?: number | null;
}

export function AdminPaymentLinkDialog({
  open,
  onOpenChange,
  userId,
  userName,
  userEmail,
  telegramUserId,
}: AdminPaymentLinkDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedTariffId, setSelectedTariffId] = useState<string>("");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [description, setDescription] = useState("");
  const [paymentType, setPaymentType] = useState<"one_time" | "subscription">("one_time");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // Fetch products
  const { data: products, isLoading: productsLoading } = useProductsV2();
  
  // Fetch tariffs for selected product
  const { data: tariffs, isLoading: tariffsLoading } = useTariffs(selectedProductId);

  // Fetch tariff prices
  const { data: tariffPrices } = useQuery({
    queryKey: ["tariff_prices_for_link", selectedTariffId],
    queryFn: async () => {
      if (!selectedTariffId) return null;
      const { data, error } = await supabase
        .from("tariff_prices")
        .select("*")
        .eq("tariff_id", selectedTariffId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!selectedTariffId,
  });

  // Reset tariff when product changes
  useEffect(() => {
    setSelectedTariffId("");
    setCustomAmount("");
    setGeneratedUrl(null);
  }, [selectedProductId]);

  // Auto-fill amount from tariff price
  useEffect(() => {
    if (tariffPrices?.price) {
      setCustomAmount(String(tariffPrices.price));
    }
    setGeneratedUrl(null);
  }, [tariffPrices]);

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setSelectedProductId("");
      setSelectedTariffId("");
      setCustomAmount("");
      setDescription("");
      setPaymentType("one_time");
      setGeneratedUrl(null);
    }
  }, [open]);

  const selectedProduct = products?.find(p => p.id === selectedProductId);
  const selectedTariff = tariffs?.find(t => t.id === selectedTariffId);
  const amount = parseFloat(customAmount) || 0;

  const createLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProductId || !selectedTariffId) {
        throw new Error("Выберите продукт и тариф");
      }
      if (amount <= 0) {
        throw new Error("Введите корректную сумму");
      }

      const { data, error } = await supabase.functions.invoke("admin-create-payment-link", {
        body: {
          user_id: userId,
          product_id: selectedProductId,
          tariff_id: selectedTariffId,
          amount: Math.round(amount * 100), // Convert to kopecks
          payment_type: paymentType,
          description: description || `${selectedProduct?.name} — ${selectedTariff?.name}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Ошибка создания ссылки");
      return data;
    },
    onSuccess: (data) => {
      setGeneratedUrl(data.redirect_url);
      toast.success("Ссылка на оплату создана");
    },
    onError: (error) => {
      toast.error("Ошибка: " + (error as Error).message);
    },
  });

  const sendToTelegramMutation = useMutation({
    mutationFn: async () => {
      if (!generatedUrl || !selectedProduct || !selectedTariff) {
        throw new Error("Нет данных для отправки");
      }

      const typeLabel = paymentType === "subscription" ? "Подписка (ежемесячно)" : "Разовая оплата";
      const telegramMessage = `💳 *Оплата подписки*

📦 Продукт: ${selectedProduct.name}
📋 Тариф: ${selectedTariff.name}
💰 Стоимость: ${amount} BYN
📅 Тип: ${typeLabel}

Для оплаты перейдите по ссылке:
${generatedUrl}`;

      const { data, error } = await supabase.functions.invoke("telegram-send-notification", {
        body: {
          user_id: userId,
          message_type: "custom",
          custom_message: telegramMessage,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Ошибка отправки");
      return data;
    },
    onSuccess: () => {
      toast.success("Ссылка отправлена клиенту в Telegram");
    },
    onError: (error) => {
      toast.error("Ошибка: " + (error as Error).message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLinkMutation.mutate();
  };

  const activeProducts = products?.filter(p => p.is_active) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Ссылка на оплату
          </DialogTitle>
          <DialogDescription>
            Создайте ссылку для самостоятельной оплаты клиентом
          </DialogDescription>
        </DialogHeader>

        {generatedUrl ? (
          // Show generated URL
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <p className="font-medium">Ссылка создана</p>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {selectedProduct?.name} — {selectedTariff?.name} · {amount} BYN
                {paymentType === "subscription" ? " (подписка)" : " (разовая)"}
              </p>
              <Input
                readOnly
                value={generatedUrl}
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => copyToClipboard(generatedUrl)}
              >
                <Copy className="h-4 w-4" />
                Копировать
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => window.open(generatedUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Открыть
              </Button>
            </div>
            {telegramUserId && (
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={sendToTelegramMutation.isPending}
                onClick={() => sendToTelegramMutation.mutate()}
              >
                {sendToTelegramMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Отправить клиенту в Telegram
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setGeneratedUrl(null)}
            >
              Создать ещё одну ссылку
            </Button>
          </div>
        ) : (
          // Show form
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User info */}
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">{userName || "—"}</p>
              <p className="text-sm text-muted-foreground">{userEmail}</p>
            </div>

            {/* Product selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Продукт
              </Label>
              {productsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите продукт" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Tariff selection */}
            {selectedProductId && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Тариф
                </Label>
                {tariffsLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : tariffs && tariffs.length > 0 ? (
                  <Select value={selectedTariffId} onValueChange={setSelectedTariffId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тариф" />
                    </SelectTrigger>
                    <SelectContent>
                      {tariffs.filter(t => t.is_active).map((tariff) => (
                        <SelectItem key={tariff.id} value={tariff.id}>
                          {tariff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">Нет доступных тарифов</p>
                )}
              </div>
            )}

            {/* Amount */}
            {selectedTariffId && (
              <div className="space-y-2">
                <Label htmlFor="link-amount">Сумма (BYN)</Label>
                <Input
                  id="link-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  required
                />
                {tariffPrices?.price && (
                  <p className="text-xs text-muted-foreground">
                    Цена тарифа: {tariffPrices.price} BYN
                  </p>
                )}
              </div>
            )}

            {/* Payment type */}
            {selectedTariffId && amount > 0 && (
              <div className="space-y-2">
                <Label>Тип оплаты</Label>
                <RadioGroup
                  value={paymentType}
                  onValueChange={(v) => setPaymentType(v as "one_time" | "subscription")}
                  className="space-y-2"
                >
                  <div
                    className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30"
                    onClick={() => setPaymentType("one_time")}
                  >
                    <RadioGroupItem value="one_time" id="pt-one-time" />
                    <Label htmlFor="pt-one-time" className="cursor-pointer">
                      <p className="font-medium">Разовая оплата</p>
                      <p className="text-xs text-muted-foreground">
                        Одноразовое списание. Клиент может привязать карту.
                      </p>
                    </Label>
                  </div>
                  <div
                    className="flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30"
                    onClick={() => setPaymentType("subscription")}
                  >
                    <RadioGroupItem value="subscription" id="pt-subscription" />
                    <Label htmlFor="pt-subscription" className="cursor-pointer">
                      <p className="font-medium">Подписка bePaid</p>
                      <p className="text-xs text-muted-foreground">
                        Ежемесячное автосписание. Управляется через bePaid.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Description */}
            {selectedTariffId && (
              <div className="space-y-2">
                <Label htmlFor="link-description">Комментарий (опционально)</Label>
                <Textarea
                  id="link-description"
                  placeholder="Описание для клиента..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {/* Summary */}
            {selectedProduct && selectedTariff && amount > 0 && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                <p className="font-medium">Ссылка на оплату:</p>
                <p className="text-sm text-muted-foreground">
                  {selectedProduct.name} — {selectedTariff.name}
                </p>
                <p className="text-lg font-bold">{amount} BYN</p>
                <p className="text-xs text-muted-foreground">
                  {paymentType === "subscription" ? "Подписка (ежемесячно)" : "Разовая оплата"}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={
                  createLinkMutation.isPending ||
                  !selectedProductId ||
                  !selectedTariffId ||
                  amount <= 0
                }
              >
                {createLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Создать ссылку
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
