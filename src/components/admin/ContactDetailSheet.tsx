import { useState } from "react";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Mail,
  Phone,
  MessageCircle,
  Calendar,
  Clock,
  Handshake,
  CreditCard,
  Copy,
  ExternalLink,
  Shield,
  Ban,
  CheckCircle,
  XCircle,
  Key,
  Plus,
  RotateCcw,
  Settings,
  ChevronRight,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { DealDetailSheet } from "./DealDetailSheet";

interface Contact {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
  status: string;
  created_at: string;
  last_seen_at: string | null;
  duplicate_flag: string | null;
  deals_count: number;
  last_deal_at: string | null;
}

interface ContactDetailSheetProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailSheet({ contact, open, onOpenChange }: ContactDetailSheetProps) {
  const queryClient = useQueryClient();
  const [selectedSubscription, setSelectedSubscription] = useState<any>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [grantProductId, setGrantProductId] = useState("");
  const [grantTariffId, setGrantTariffId] = useState("");
  const [grantDays, setGrantDays] = useState(30);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [dealSheetOpen, setDealSheetOpen] = useState(false);

  // Fetch deals for this contact
  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["contact-deals", contact?.user_id],
    queryFn: async () => {
      if (!contact?.user_id) return [];
      const { data, error } = await supabase
        .from("orders_v2")
        .select(`
          *,
          products_v2(id, name, code),
          tariffs(id, name, code)
        `)
        .eq("user_id", contact.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contact?.user_id,
  });

  // Fetch subscriptions for this contact
  const { data: subscriptions, isLoading: subsLoading, refetch: refetchSubs } = useQuery({
    queryKey: ["contact-subscriptions", contact?.user_id],
    queryFn: async () => {
      if (!contact?.user_id) return [];
      const { data, error } = await supabase
        .from("subscriptions_v2")
        .select(`
          *,
          products_v2(id, name, code, telegram_club_id),
          tariffs(id, name, code)
        `)
        .eq("user_id", contact.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contact?.user_id,
  });

  // Fetch products for grant access
  const { data: products } = useQuery({
    queryKey: ["products-for-grant"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_v2")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch tariffs for selected product
  const { data: tariffs } = useQuery({
    queryKey: ["tariffs-for-grant", grantProductId],
    queryFn: async () => {
      if (!grantProductId) return [];
      const { data, error } = await supabase
        .from("tariffs")
        .select("id, name, code")
        .eq("product_id", grantProductId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!grantProductId,
  });

  // Fetch communication history (audit logs for this user)
  const { data: communications, isLoading: commsLoading } = useQuery({
    queryKey: ["contact-communications", contact?.user_id],
    queryFn: async () => {
      if (!contact?.user_id) return [];
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("target_user_id", contact.user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!contact?.user_id,
  });

  // Fetch duplicate info
  const { data: duplicateInfo } = useQuery({
    queryKey: ["contact-duplicates", contact?.id],
    queryFn: async () => {
      if (!contact?.duplicate_flag) return null;
      const { data, error } = await supabase
        .from("duplicate_cases")
        .select(`
          *,
          client_duplicates(
            profile_id,
            is_master,
            profiles:profile_id(id, email, full_name, phone)
          )
        `)
        .eq("phone", contact.phone || "")
        .eq("status", "new")
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!contact?.duplicate_flag,
  });

  // Admin action mutation
  const adminActionMutation = useMutation({
    mutationFn: async ({ action, subscriptionId, data }: { action: string; subscriptionId: string; data?: Record<string, any> }) => {
      const { data: result, error } = await supabase.functions.invoke("subscription-admin-actions", {
        body: {
          action,
          subscription_id: subscriptionId,
          ...data,
        },
      });
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      const messages: Record<string, string> = {
        cancel: "Подписка отменена",
        resume: "Подписка восстановлена",
        extend: "Доступ продлён",
        grant_access: "Доступ выдан",
        revoke_access: "Доступ отозван",
      };
      toast.success(messages[variables.action] || "Действие выполнено");
      refetchSubs();
      setSelectedSubscription(null);
    },
    onError: (error) => {
      toast.error("Ошибка: " + (error as Error).message);
    },
  });

  const handleSubscriptionAction = async (action: string, subscriptionId: string, data?: Record<string, any>) => {
    setIsProcessing(true);
    try {
      await adminActionMutation.mutateAsync({ action, subscriptionId, data });
    } finally {
      setIsProcessing(false);
    }
  };

  // Grant new access
  const handleGrantNewAccess = async () => {
    if (!contact?.user_id || !grantProductId || !grantTariffId) {
      toast.error("Выберите продукт и тариф");
      return;
    }

    setIsProcessing(true);
    try {
      const accessEnd = new Date(Date.now() + grantDays * 24 * 60 * 60 * 1000);
      
      // Create subscription
      const { data: newSub, error } = await supabase.from("subscriptions_v2").insert({
        user_id: contact.user_id,
        product_id: grantProductId,
        tariff_id: grantTariffId,
        status: "active",
        is_trial: false,
        access_start_at: new Date().toISOString(),
        access_end_at: accessEnd.toISOString(),
      }).select().single();

      if (error) throw error;

      // Get tariff to check for GetCourse offer code
      const { data: tariff } = await supabase
        .from("tariffs")
        .select("getcourse_offer_code")
        .eq("id", grantTariffId)
        .single();

      // Get product for telegram club
      const { data: product } = await supabase
        .from("products_v2")
        .select("telegram_club_id")
        .eq("id", grantProductId)
        .single();

      // Grant Telegram access if product has club
      if (product?.telegram_club_id) {
        await supabase.functions.invoke("telegram-grant-access", {
          body: {
            user_id: contact.user_id,
            duration_days: grantDays,
          },
        });
      }

      // Sync to GetCourse if offer code exists
      if (tariff?.getcourse_offer_code) {
        await supabase.functions.invoke("getcourse-sync", {
          body: {
            action: "add_user_to_offer",
            user_id: contact.user_id,
            offer_code: tariff.getcourse_offer_code,
          },
        });
      }

      // Log action
      await supabase.from("audit_logs").insert({
        actor_user_id: (await supabase.auth.getUser()).data.user?.id,
        action: "admin.grant_access",
        target_user_id: contact.user_id,
        meta: { 
          product_id: grantProductId, 
          tariff_id: grantTariffId, 
          days: grantDays,
          subscription_id: newSub?.id,
          getcourse_offer_code: tariff?.getcourse_offer_code,
        },
      });

      toast.success(`Доступ выдан на ${grantDays} дней`);
      refetchSubs();
      setGrantProductId("");
      setGrantTariffId("");
    } catch (error) {
      console.error("Grant access error:", error);
      toast.error("Ошибка выдачи доступа");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} скопирован`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-500/20 text-green-600";
      case "pending": return "bg-amber-500/20 text-amber-600";
      case "cancelled": 
      case "failed": return "bg-red-500/20 text-red-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getSubscriptionStatusBadge = (sub: any) => {
    const isExpired = sub.access_end_at && new Date(sub.access_end_at) < new Date();
    const isCanceled = !!sub.canceled_at;
    
    if (isExpired) {
      return <Badge variant="secondary">Истекла</Badge>;
    }
    if (isCanceled) {
      return <Badge variant="outline" className="text-amber-600 border-amber-300">Не продлевается</Badge>;
    }
    if (sub.status === "trial") {
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Триал</Badge>;
    }
    if (sub.status === "active") {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Активна</Badge>;
    }
    return <Badge variant="outline">{sub.status}</Badge>;
  };

  const activeSubscriptions = subscriptions?.filter(s => {
    const isExpired = s.access_end_at && new Date(s.access_end_at) < new Date();
    return !isExpired && (s.status === "active" || s.status === "trial");
  }) || [];

  if (!contact) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col h-full overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                <User className="w-7 h-7 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-xl">{contact.full_name || "Без имени"}</SheetTitle>
                <p className="text-sm text-muted-foreground">{contact.email}</p>
              </div>
            </div>
            <Badge variant={contact.status === "active" ? "default" : "secondary"}>
              {contact.status === "active" ? (
                <><CheckCircle className="w-3 h-3 mr-1" />Активен</>
              ) : contact.status === "blocked" ? (
                <><Ban className="w-3 h-3 mr-1" />Заблокирован</>
              ) : (
                <><XCircle className="w-3 h-3 mr-1" />{contact.status}</>
              )}
            </Badge>
          </div>
        </SheetHeader>

        <Tabs defaultValue="profile" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4 justify-start flex-wrap flex-shrink-0">
            <TabsTrigger value="profile">Профиль</TabsTrigger>
            <TabsTrigger value="access">
              Доступы {activeSubscriptions.length > 0 && <Badge variant="secondary" className="ml-1">{activeSubscriptions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="deals">
              Сделки {deals && deals.length > 0 && <Badge variant="secondary" className="ml-1">{deals.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="communications">События</TabsTrigger>
            {contact.duplicate_flag && (
              <TabsTrigger value="duplicates">Дубли</TabsTrigger>
            )}
          </TabsList>

          <ScrollArea className="flex-1 min-h-0 px-6 py-4">
            {/* Profile Tab */}
            <TabsContent value="profile" className="m-0 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Контактные данные</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{contact.email || "—"}</span>
                    </div>
                    {contact.email && (
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(contact.email!, "Email")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{contact.phone || "—"}</span>
                    </div>
                    {contact.phone && (
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(contact.phone!, "Телефон")}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <MessageCircle className="w-4 h-4 text-blue-500" />
                      {contact.telegram_username ? (
                        <span>@{contact.telegram_username}</span>
                      ) : contact.telegram_user_id ? (
                        <span className="text-muted-foreground">ID: {contact.telegram_user_id}</span>
                      ) : (
                        <span className="text-muted-foreground">Не привязан</span>
                      )}
                    </div>
                    {contact.telegram_username && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`https://t.me/${contact.telegram_username}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Системная информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Регистрация</span>
                    </div>
                    <span className="text-sm">{format(new Date(contact.created_at), "dd MMM yyyy HH:mm", { locale: ru })}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Последний визит</span>
                    </div>
                    <span className="text-sm">
                      {contact.last_seen_at 
                        ? format(new Date(contact.last_seen_at), "dd MMM yyyy HH:mm", { locale: ru })
                        : "—"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">ID пользователя</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(contact.user_id, "ID")}>
                      <code className="text-xs mr-2">{contact.user_id.slice(0, 8)}...</code>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Access/Subscriptions Tab */}
            <TabsContent value="access" className="m-0 space-y-4">
              {/* Grant new access */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Выдать новый доступ
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Продукт</Label>
                      <Select value={grantProductId} onValueChange={(v) => { setGrantProductId(v); setGrantTariffId(""); }}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Выбрать..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Тариф</Label>
                      <Select value={grantTariffId} onValueChange={setGrantTariffId} disabled={!grantProductId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Выбрать..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tariffs?.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Дней доступа</Label>
                      <Input
                        type="number"
                        value={grantDays}
                        onChange={(e) => setGrantDays(parseInt(e.target.value) || 30)}
                        min={1}
                        className="h-9"
                      />
                    </div>
                    <Button
                      onClick={handleGrantNewAccess}
                      disabled={isProcessing || !grantProductId || !grantTariffId}
                      className="gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Выдать
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Existing subscriptions */}
              {subsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : !subscriptions?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Нет подписок</p>
                </div>
              ) : (
                subscriptions.map(sub => {
                  const product = sub.products_v2 as any;
                  const tariff = sub.tariffs as any;
                  const isSelected = selectedSubscription?.id === sub.id;
                  const isCanceled = !!sub.canceled_at;
                  const isExpired = sub.access_end_at && new Date(sub.access_end_at) < new Date();
                  const isActive = !isExpired && (sub.status === "active" || sub.status === "trial");

                  return (
                    <Card key={sub.id} className={`transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium">{product?.name || "Продукт"}</div>
                            <div className="text-sm text-muted-foreground">{tariff?.name}</div>
                          </div>
                          {getSubscriptionStatusBadge(sub)}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                          <div>
                            <span className="text-muted-foreground">Начало: </span>
                            <span>{format(new Date(sub.access_start_at), "dd.MM.yy")}</span>
                          </div>
                          {sub.access_end_at && (
                            <div>
                              <span className="text-muted-foreground">До: </span>
                              <span className={isExpired ? "text-destructive" : ""}>{format(new Date(sub.access_end_at), "dd.MM.yy")}</span>
                            </div>
                          )}
                          {sub.next_charge_at && !isCanceled && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">Списание: </span>
                              <span>{format(new Date(sub.next_charge_at), "dd.MM.yy")}</span>
                            </div>
                          )}
                        </div>

                        {/* Quick actions */}
                        <div className="flex flex-wrap gap-2">
                          {/* Extend */}
                          {isSelected ? (
                            <div className="flex gap-1 items-center w-full">
                              <Input
                                type="number"
                                value={extendDays}
                                onChange={(e) => setExtendDays(parseInt(e.target.value) || 30)}
                                className="h-8 w-20"
                                min={1}
                              />
                              <span className="text-xs">дней</span>
                              <Button
                                size="sm"
                                onClick={() => handleSubscriptionAction("extend", sub.id, { days: extendDays })}
                                disabled={isProcessing}
                                className="h-8 gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Продлить
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedSubscription(null)}
                                className="h-8"
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedSubscription(sub)}
                                className="h-7 text-xs gap-1"
                              >
                                <Settings className="w-3 h-3" />
                                Управление
                              </Button>
                              
                              {isCanceled && isActive ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSubscriptionAction("resume", sub.id)}
                                  disabled={isProcessing}
                                  className="h-7 text-xs gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Возобновить
                                </Button>
                              ) : isActive ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSubscriptionAction("cancel", sub.id)}
                                    disabled={isProcessing}
                                    className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700"
                                  >
                                    <Ban className="w-3 h-3" />
                                    Отменить
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSubscriptionAction("revoke_access", sub.id)}
                                    disabled={isProcessing}
                                    className="h-7 text-xs gap-1 text-red-600 hover:text-red-700"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Заблокировать
                                  </Button>
                                </>
                              ) : null}

                              {!isActive && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleSubscriptionAction("grant_access", sub.id)}
                                  disabled={isProcessing}
                                  className="h-7 text-xs gap-1"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Активировать
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            {/* Deals Tab */}
            <TabsContent value="deals" className="m-0 space-y-4">
              {dealsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : !deals?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Handshake className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Нет сделок</p>
                </div>
              ) : (
                deals.map(deal => (
                  <Card 
                    key={deal.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setSelectedDeal(deal);
                      setDealSheetOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium">{(deal.products_v2 as any)?.name || "Продукт"}</div>
                          {deal.tariffs && (
                            <div className="text-sm text-muted-foreground">{(deal.tariffs as any)?.name}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(deal.status)}>{deal.status}</Badge>
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(deal.created_at), "dd.MM.yy HH:mm")}
                        </div>
                        <div className="flex items-center gap-2 font-medium">
                          <CreditCard className="w-3 h-3" />
                          {new Intl.NumberFormat("ru-BY", { style: "currency", currency: deal.currency }).format(Number(deal.final_price))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Communications Tab */}
            <TabsContent value="communications" className="m-0 space-y-4">
              {commsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !communications?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Нет событий</p>
                </div>
              ) : (
                communications.map(comm => (
                  <Card key={comm.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{comm.action}</div>
                          {comm.meta && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {JSON.stringify(comm.meta).slice(0, 100)}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(comm.created_at), "dd.MM.yy HH:mm")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Duplicates Tab */}
            {contact.duplicate_flag && (
              <TabsContent value="duplicates" className="m-0 space-y-4">
                {duplicateInfo ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Найденные дубли по телефону {duplicateInfo.phone}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(duplicateInfo.client_duplicates as any[])?.map((dup: any) => (
                        <div key={dup.profile_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <div className="font-medium">{dup.profiles?.full_name || "Без имени"}</div>
                            <div className="text-sm text-muted-foreground">{dup.profiles?.email}</div>
                          </div>
                          {dup.is_master && (
                            <Badge variant="outline">Главный</Badge>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Copy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Информация о дублях недоступна</p>
                  </div>
                )}
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>

        {/* Deal Detail Sheet */}
        <DealDetailSheet
          deal={selectedDeal}
          profile={contact}
          open={dealSheetOpen}
          onOpenChange={setDealSheetOpen}
        />
      </SheetContent>
    </Sheet>
  );
}
