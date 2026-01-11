import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShoppingCart, X, AlertCircle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useBepaidQueueActions, useBepaidMappings } from "@/hooks/useBepaidMappings";
import { useProductsV2, useTariffs } from "@/hooks/useProductsV2";
import { QueueItem } from "@/hooks/useBepaidData";
import { toast } from "sonner";

interface BulkProcessBarProps {
  selectedItems: QueueItem[];
  onSuccess?: () => void;
  onClearSelection?: () => void;
}

export default function BulkProcessBar({ selectedItems, onSuccess, onClearSelection }: BulkProcessBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number; skipped: number }>({ success: 0, failed: 0, skipped: 0 });
  const [fallbackProductId, setFallbackProductId] = useState<string>("");
  const [fallbackTariffId, setFallbackTariffId] = useState<string>("");
  
  const { createOrderFromQueueAsync } = useBepaidQueueActions();
  const { mappings } = useBepaidMappings();
  const { data: products } = useProductsV2();
  const { data: allTariffs } = useTariffs();

  // Categorize items
  const itemsWithProfile = selectedItems.filter(item => item.matched_profile_id);
  const itemsWithMapping = itemsWithProfile.filter(item => 
    mappings.some(m => m.bepaid_plan_title === item.product_name && m.auto_create_order)
  );
  const itemsWithProfileNoMapping = itemsWithProfile.filter(item => 
    !mappings.some(m => m.bepaid_plan_title === item.product_name && m.auto_create_order)
  );
  const itemsWithoutProfile = selectedItems.filter(item => !item.matched_profile_id);

  const canProcessWithMapping = itemsWithMapping.length;
  const canProcessWithFallback = fallbackProductId && itemsWithProfileNoMapping.length;
  const totalProcessable = canProcessWithMapping + (canProcessWithFallback ? itemsWithProfileNoMapping.length : 0);

  const handleBulkProcess = async () => {
    setIsProcessing(true);
    setProgress(0);
    setResults({ success: 0, failed: 0, skipped: 0 });

    const itemsToProcess: Array<{
      queueItemId: string;
      profileId: string;
      productId?: string;
      tariffId?: string;
      offerId?: string;
    }> = [];

    // Items with mapping
    for (const item of itemsWithMapping) {
      const mapping = mappings.find(m => m.bepaid_plan_title === item.product_name);
      if (mapping && item.matched_profile_id) {
        itemsToProcess.push({
          queueItemId: item.id,
          profileId: item.matched_profile_id,
          productId: mapping.product_id || undefined,
          tariffId: mapping.tariff_id || undefined,
          offerId: mapping.offer_id || undefined,
        });
      }
    }

    // Items with fallback product (if selected)
    if (fallbackProductId && fallbackProductId !== "__none__") {
      for (const item of itemsWithProfileNoMapping) {
        if (item.matched_profile_id) {
          itemsToProcess.push({
            queueItemId: item.id,
            profileId: item.matched_profile_id,
            productId: fallbackProductId,
            tariffId: fallbackTariffId !== "__none__" ? fallbackTariffId : undefined,
          });
        }
      }
    }

    let success = 0;
    let failed = 0;

    for (let i = 0; i < itemsToProcess.length; i++) {
      try {
        await createOrderFromQueueAsync(itemsToProcess[i]);
        success++;
      } catch (error) {
        failed++;
        console.error("Failed to process item:", error);
      }
      setProgress(Math.round(((i + 1) / itemsToProcess.length) * 100));
      setResults({ success, failed, skipped: itemsWithoutProfile.length });
    }

    setIsProcessing(false);
    
    if (success > 0) {
      toast.success(`Создано ${success} сделок${failed > 0 ? `, ошибок: ${failed}` : ""}`);
      onSuccess?.();
    } else if (failed > 0) {
      toast.error(`Все ${failed} сделок завершились ошибкой`);
    }

    // Close dialog after completion
    setTimeout(() => {
      setDialogOpen(false);
      onClearSelection?.();
    }, 1500);
  };

  return (
    <>
      <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-base px-3 py-1">
            Выбрано: {selectedItems.length}
          </Badge>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">С контактом:</span>
            <Badge variant="default">{itemsWithProfile.length}</Badge>
            <span className="text-muted-foreground">С маппингом:</span>
            <Badge variant="default" className="bg-green-600">{itemsWithMapping.length}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <X className="h-4 w-4 mr-1" />
            Снять выбор
          </Button>
          <Button 
            onClick={() => setDialogOpen(true)}
            disabled={itemsWithProfile.length === 0}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Создать сделки
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Массовое создание сделок</DialogTitle>
            <DialogDescription>
              Создать заказы и платежи из выбранных записей очереди
            </DialogDescription>
          </DialogHeader>

          {!isProcessing && results.success === 0 && (
            <div className="space-y-4 py-4">
              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Выбрано записей:</span>
                  <span className="font-medium">{selectedItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">С привязанным контактом:</span>
                  <span className="font-medium text-green-600">{itemsWithProfile.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">С настроенным маппингом:</span>
                  <span className="font-medium text-green-600">{itemsWithMapping.length}</span>
                </div>
                {itemsWithProfileNoMapping.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Без маппинга (нужен продукт):</span>
                    <span className="font-medium text-amber-600">{itemsWithProfileNoMapping.length}</span>
                  </div>
                )}
                {itemsWithoutProfile.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Без контакта (пропустим):</span>
                    <span className="font-medium text-destructive">{itemsWithoutProfile.length}</span>
                  </div>
                )}
              </div>

              {/* Fallback product selection for items without mapping */}
              {itemsWithProfileNoMapping.length > 0 && (
                <div className="space-y-3">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {itemsWithProfileNoMapping.length} записей не имеют настроенного маппинга. 
                      Выберите продукт для их обработки или они будут пропущены.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="space-y-2">
                    <Label>Продукт для записей без маппинга</Label>
                    <Select value={fallbackProductId} onValueChange={setFallbackProductId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Пропустить эти записи" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Пропустить эти записи</SelectItem>
                        {products?.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {fallbackProductId && fallbackProductId !== "__none__" && allTariffs && 
                   allTariffs.filter(t => t.product_id === fallbackProductId).length > 0 && (
                    <div className="space-y-2">
                      <Label>Тариф</Label>
                      <Select value={fallbackTariffId} onValueChange={setFallbackTariffId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Без тарифа" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Без тарифа</SelectItem>
                          {allTariffs.filter(t => t.product_id === fallbackProductId).map((tariff) => (
                            <SelectItem key={tariff.id} value={tariff.id}>
                              {tariff.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Ready to process summary */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                <span className="text-green-700 font-medium">
                  Будет создано сделок: {totalProcessable}
                </span>
              </div>
            </div>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div className="py-8 space-y-4">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                <p className="text-lg font-medium">Создание сделок...</p>
                <p className="text-sm text-muted-foreground">
                  {results.success + results.failed} из {totalProcessable}
                </p>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Results */}
          {!isProcessing && results.success > 0 && (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <p className="text-lg font-medium">Обработка завершена</p>
              <div className="flex justify-center gap-4 text-sm">
                <span className="text-green-600">Создано: {results.success}</span>
                {results.failed > 0 && <span className="text-destructive">Ошибок: {results.failed}</span>}
                {results.skipped > 0 && <span className="text-muted-foreground">Пропущено: {results.skipped}</span>}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isProcessing}>
              {results.success > 0 ? "Закрыть" : "Отмена"}
            </Button>
            {!isProcessing && results.success === 0 && (
              <Button 
                onClick={handleBulkProcess} 
                disabled={totalProcessable === 0}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Создать {totalProcessable} сделок
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
