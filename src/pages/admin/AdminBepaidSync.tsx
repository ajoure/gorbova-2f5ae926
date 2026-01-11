import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Play, Download, AlertCircle, CheckCircle2, User, CreditCard, Mail, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface SyncResult {
  bepaid_uid: string;
  email: string | null;
  card_holder: string | null;
  card_holder_cyrillic: string | null;
  card_mask: string | null;
  amount: number;
  currency: string;
  paid_at: string | null;
  matched_profile_id: string | null;
  matched_profile_name: string | null;
  match_type: 'email' | 'card_mask' | 'name_translit' | 'none';
  action: 'created' | 'skipped_duplicate' | 'skipped_no_match' | 'error';
  order_id: string | null;
  error?: string;
}

interface SyncStats {
  total_fetched: number;
  matched_by_email: number;
  matched_by_card: number;
  matched_by_name: number;
  not_matched: number;
  skipped_duplicate: number;
  created: number;
  errors: number;
}

export default function AdminBepaidSync() {
  const [dryRun, setDryRun] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [results, setResults] = useState<SyncResult[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const queryClient = useQueryClient();

  // Query existing payments count
  const { data: paymentsCount } = useQuery({
    queryKey: ["bepaid-payments-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("payments_v2")
        .select("id", { count: "exact", head: true })
        .eq("provider", "bepaid");
      return count || 0;
    },
  });

  // Query queue count
  const { data: queueCount } = useQuery({
    queryKey: ["bepaid-queue-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("payment_reconcile_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count || 0;
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("bepaid-full-sync", {
        body: { dryRun, fromDate: fromDate || undefined, toDate: toDate || undefined },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setResults(data.results || []);
      setStats(data.stats || null);
      
      if (data.dryRun) {
        toast.success(`Предпросмотр завершён: найдено ${data.stats?.created || 0} платежей для импорта`);
      } else {
        toast.success(`Синхронизация завершена: импортировано ${data.stats?.created || 0} платежей`);
        queryClient.invalidateQueries({ queryKey: ["bepaid-payments-count"] });
      }
    },
    onError: (error: Error) => {
      toast.error(`Ошибка синхронизации: ${error.message}`);
    },
  });

  const filteredResults = results.filter(r => {
    if (activeTab === "all") return true;
    if (activeTab === "matched") return r.match_type !== "none";
    if (activeTab === "unmatched") return r.match_type === "none" && r.action !== "skipped_duplicate";
    if (activeTab === "duplicates") return r.action === "skipped_duplicate";
    if (activeTab === "errors") return r.action === "error";
    return true;
  });

  const getMatchTypeIcon = (matchType: string) => {
    switch (matchType) {
      case "email": return <Mail className="h-4 w-4 text-green-500" />;
      case "card_mask": return <CreditCard className="h-4 w-4 text-blue-500" />;
      case "name_translit": return <User className="h-4 w-4 text-amber-500" />;
      default: return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getMatchTypeBadge = (matchType: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      email: { variant: "default", label: "Email" },
      card_mask: { variant: "secondary", label: "Карта" },
      name_translit: { variant: "outline", label: "Имя" },
      none: { variant: "destructive", label: "Нет" },
    };
    const config = variants[matchType] || variants.none;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      created: { variant: "default", label: "Создан" },
      skipped_duplicate: { variant: "secondary", label: "Дубликат" },
      skipped_no_match: { variant: "outline", label: "Не найден" },
      error: { variant: "destructive", label: "Ошибка" },
    };
    const config = variants[action] || { variant: "outline" as const, label: action };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const exportResults = () => {
    const csv = [
      ["UID", "Email", "Владелец карты", "Владелец (кириллица)", "Маска", "Сумма", "Валюта", "Дата", "Клиент", "Тип совпадения", "Действие"].join(";"),
      ...results.map(r => [
        r.bepaid_uid,
        r.email || "",
        r.card_holder || "",
        r.card_holder_cyrillic || "",
        r.card_mask || "",
        r.amount,
        r.currency,
        r.paid_at || "",
        r.matched_profile_name || "",
        r.match_type,
        r.action,
      ].join(";"))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bepaid-sync-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Синхронизация bePaid</h1>
          <p className="text-muted-foreground">
            Импорт всех покупок из bePaid с сопоставлением клиентов
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Платежи в системе</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paymentsCount ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">В очереди</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queueCount ?? "..."}</div>
          </CardContent>
        </Card>
        {stats && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Получено из bePaid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_fetched}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Сопоставлено</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {stats.matched_by_email + stats.matched_by_card + stats.matched_by_name}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Email: {stats.matched_by_email} | Карта: {stats.matched_by_card} | Имя: {stats.matched_by_name}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры синхронизации</CardTitle>
          <CardDescription>
            Настройте параметры и запустите синхронизацию
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="fromDate">С даты</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toDate">По дату</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="dryRun"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <Label htmlFor="dryRun">
                Предпросмотр (без сохранения)
              </Label>
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {dryRun ? "Предпросмотр" : "Синхронизировать"}
            </Button>
            {results.length > 0 && (
              <Button variant="outline" onClick={exportResults}>
                <Download className="h-4 w-4 mr-2" />
                Экспорт CSV
              </Button>
            )}
          </div>

          {!dryRun && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                Режим записи: данные будут сохранены в базу данных
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Результаты ({results.length})</CardTitle>
              {stats && (
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Создано: {stats.created}
                  </span>
                  <span>Дубликаты: {stats.skipped_duplicate}</span>
                  <span>Не найдено: {stats.not_matched}</span>
                  {stats.errors > 0 && (
                    <span className="text-destructive">Ошибки: {stats.errors}</span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">Все ({results.length})</TabsTrigger>
                <TabsTrigger value="matched">
                  Сопоставлено ({results.filter(r => r.match_type !== "none").length})
                </TabsTrigger>
                <TabsTrigger value="unmatched">
                  Не найдено ({results.filter(r => r.match_type === "none" && r.action !== "skipped_duplicate").length})
                </TabsTrigger>
                <TabsTrigger value="duplicates">
                  Дубликаты ({results.filter(r => r.action === "skipped_duplicate").length})
                </TabsTrigger>
                {stats && stats.errors > 0 && (
                  <TabsTrigger value="errors" className="text-destructive">
                    Ошибки ({stats.errors})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value={activeTab}>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Владелец карты</TableHead>
                        <TableHead>Кириллица</TableHead>
                        <TableHead>Маска</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Совпадение</TableHead>
                        <TableHead>Клиент</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredResults.map((r, idx) => (
                        <TableRow key={r.bepaid_uid || idx}>
                          <TableCell className="text-xs">
                            {r.paid_at ? format(new Date(r.paid_at), "dd.MM.yy", { locale: ru }) : "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">
                            {r.email || "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[120px] truncate">
                            {r.card_holder || "—"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[120px] truncate">
                            {r.card_holder_cyrillic || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.card_mask ? `****${r.card_mask}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {r.amount.toFixed(2)} {r.currency}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getMatchTypeIcon(r.match_type)}
                              {getMatchTypeBadge(r.match_type)}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">
                            {r.matched_profile_name || "—"}
                          </TableCell>
                          <TableCell>{getActionBadge(r.action)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
