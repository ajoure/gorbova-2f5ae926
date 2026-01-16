import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Archive,
  Play,
  CheckCircle,
  AlertCircle,
  Package,
  Users,
  CreditCard,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminBepaidArchiveImport() {
  const [onlyMapped, setOnlyMapped] = useState(false);
  const [batchSize, setBatchSize] = useState("100");
  const queryClient = useQueryClient();

  // Fetch queue stats
  const { data: queueStats, isLoading: statsLoading } = useQuery({
    queryKey: ["bepaid-queue-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_reconcile_queue")
        .select("status");
      
      if (error) throw error;
      
      const pending = data?.filter(i => i.status === "pending").length || 0;
      const completed = data?.filter(i => i.status === "completed").length || 0;
      const errored = data?.filter(i => i.status === "error").length || 0;
      
      return { pending, completed, errored, total: data?.length || 0 };
    },
  });

  // Fetch unique unmapped products from queue
  const { data: unmappedProducts, isLoading: unmappedLoading, refetch: refetchUnmapped } = useQuery({
    queryKey: ["bepaid-unmapped-descriptions"],
    queryFn: async () => {
      // Get pending queue items
      const { data: queue } = await supabase
        .from("payment_reconcile_queue")
        .select("description, raw_payload, amount")
        .eq("status", "pending");

      // Get existing mappings
      const { data: mappings } = await supabase
        .from("bepaid_product_mappings")
        .select("bepaid_plan_title, product_id");

      const mappedTitles = new Set((mappings || []).map(m => m.bepaid_plan_title?.toLowerCase()));

      // Extract unique product names
      const productCounts = new Map<string, { count: number; amount: number; hasMapping: boolean }>();

      (queue || []).forEach(item => {
        const payload = item.raw_payload as Record<string, any> || {};
        const plan = payload.plan || {};
        const additionalData = payload.additional_data || {};
        
        // Extract product name from description or plan title
        let productName = "";
        const desc = item.description || additionalData.description || "";
        
        // Try to extract from "Оплата по сделке X (Product Name)"
        const match = desc.match(/\(([^)]+)\)/);
        if (match) {
          productName = match[1];
        } else {
          productName = plan.title || plan.name || desc || "Unknown";
        }

        const key = productName.toLowerCase();
        const existing = productCounts.get(key);
        const hasMapping = mappedTitles.has(key) || mappedTitles.has((plan.title || "").toLowerCase());
        
        if (existing) {
          existing.count++;
          existing.amount += item.amount || 0;
        } else {
          productCounts.set(key, { 
            count: 1, 
            amount: item.amount || 0,
            hasMapping,
          });
        }
      });

      return Array.from(productCounts.entries())
        .map(([name, data]) => ({
          productName: name,
          count: data.count,
          totalAmount: data.amount,
          hasMapping: data.hasMapping,
        }))
        .sort((a, b) => b.count - a.count);
    },
  });

  // Fetch available products for mapping
  const { data: products } = useQuery({
    queryKey: ["products-for-mapping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_v2")
        .select("id, name, code, status")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Dry run mutation
  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("bepaid-archive-import", {
        body: { 
          batchSize: parseInt(batchSize), 
          dryRun: true,
          onlyMapped,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Dry run: ${data.stats?.processed || 0} items would be processed`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("bepaid-archive-import", {
        body: { 
          batchSize: parseInt(batchSize), 
          dryRun: false,
          onlyMapped,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bepaid-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["bepaid-unmapped-descriptions"] });
      toast.success(`Импортировано: ${data.stats?.ordersCreated || 0} сделок, ${data.stats?.paymentsCreated || 0} платежей`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка импорта: ${error.message}`);
    },
  });

  // Create mapping mutation
  const createMappingMutation = useMutation({
    mutationFn: async ({ title, productId }: { title: string; productId: string }) => {
      const { error } = await supabase
        .from("bepaid_product_mappings")
        .insert({
          bepaid_plan_title: title,
          product_id: productId,
          auto_create_order: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bepaid-unmapped-descriptions"] });
      toast.success("Маппинг создан");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const progress = queueStats 
    ? Math.round((queueStats.completed / queueStats.total) * 100) 
    : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="h-6 w-6" />
              Импорт архива bePaid 2025
            </h1>
            <p className="text-muted-foreground">
              Массовый импорт транзакций из очереди сверки
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["bepaid-queue-stats"] });
            refetchUnmapped();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                В очереди
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-amber-600">
                  {queueStats?.pending || 0}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Обработано
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  {queueStats?.completed || 0}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Ошибки
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-destructive">
                  {queueStats?.errored || 0}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                Уник. продуктов
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unmappedLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {unmappedProducts?.length || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Progress */}
        {queueStats && queueStats.total > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Прогресс обработки</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {queueStats.completed} из {queueStats.total} ({progress}%)
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Управление импортом
            </CardTitle>
            <CardDescription>
              Настройки и запуск массового импорта
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-6">
              <div className="space-y-2">
                <Label>Размер пакета</Label>
                <Select value={batchSize} onValueChange={setBatchSize}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 записей</SelectItem>
                    <SelectItem value="100">100 записей</SelectItem>
                    <SelectItem value="200">200 записей</SelectItem>
                    <SelectItem value="500">500 записей</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="only-mapped"
                  checked={onlyMapped}
                  onCheckedChange={setOnlyMapped}
                />
                <Label htmlFor="only-mapped">
                  Только с маппингом продуктов
                </Label>
              </div>
            </div>

            <div className="flex gap-4">
              <Button 
                variant="outline" 
                onClick={() => dryRunMutation.mutate()}
                disabled={dryRunMutation.isPending || importMutation.isPending}
              >
                {dryRunMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Тестовый запуск (Dry Run)
              </Button>
              
              <Button 
                onClick={() => importMutation.mutate()}
                disabled={dryRunMutation.isPending || importMutation.isPending}
              >
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Play className="h-4 w-4 mr-2" />
                Запустить импорт
              </Button>
            </div>

            {/* Last run stats */}
            {(dryRunMutation.data || importMutation.data) && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Результат последнего запуска:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Обработано:</span>{" "}
                    <strong>{(dryRunMutation.data || importMutation.data)?.stats?.processed || 0}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Сделок:</span>{" "}
                    <strong className="text-green-600">{(dryRunMutation.data || importMutation.data)?.stats?.ordersCreated || 0}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Профилей:</span>{" "}
                    <strong>{(dryRunMutation.data || importMutation.data)?.stats?.profilesCreated || 0}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Возвратов:</span>{" "}
                    <strong>{(dryRunMutation.data || importMutation.data)?.stats?.refundsProcessed || 0}</strong>
                  </div>
                </div>
                {(dryRunMutation.data || importMutation.data)?.stats?.errors?.length > 0 && (
                  <div className="mt-2 text-sm text-destructive">
                    Ошибки: {(dryRunMutation.data || importMutation.data)?.stats?.errors?.length}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Mapping Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Маппинг продуктов
            </CardTitle>
            <CardDescription>
              Сопоставьте названия из bePaid с системными продуктами
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unmappedLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !unmappedProducts?.length ? (
              <div className="text-center text-muted-foreground py-8">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Все продукты сопоставлены</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название из bePaid</TableHead>
                    <TableHead className="text-right">Кол-во</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Системный продукт</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmappedProducts.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.count}
                      </TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat("ru-BY", { 
                          style: "currency", 
                          currency: "BYN" 
                        }).format(item.totalAmount)}
                      </TableCell>
                      <TableCell>
                        {item.hasMapping ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Сопоставлен
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Не сопоставлен
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!item.hasMapping && (
                          <Select
                            onValueChange={(productId) => {
                              createMappingMutation.mutate({
                                title: item.productName,
                                productId,
                              });
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Выберите продукт" />
                            </SelectTrigger>
                            <SelectContent>
                              {products?.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
