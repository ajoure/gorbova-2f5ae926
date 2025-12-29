import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Receipt, CheckCircle, XCircle, Clock, CreditCard, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { PaymentDialog } from "@/components/payment/PaymentDialog";

interface Order {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  bepaid_uid: string | null;
  customer_email: string | null;
  created_at: string;
  products: {
    name: string;
    product_type: string;
  } | null;
}

interface Entitlement {
  id: string;
  product_code: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  meta: Record<string, any> | null;
}

interface Product {
  id: string;
  name: string;
  price_byn: number;
  product_type: string;
  tier: string | null;
}

export default function Purchases() {
  const { user } = useAuth();
  const [renewProduct, setRenewProduct] = useState<{ id: string; name: string; price: number } | null>(null);

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["user-orders", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(name, product_type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    },
    enabled: !!user,
  });

  const { data: entitlements, isLoading: entitlementsLoading } = useQuery({
    queryKey: ["user-entitlements", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("entitlements")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Entitlement[];
    },
    enabled: !!user,
  });

  // Fetch products for renewal
  const { data: products } = useQuery({
    queryKey: ["products-for-renewal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price_byn, product_type, tier")
        .eq("is_active", true);
      
      if (error) throw error;
      return data as Product[];
    },
  });

  const findProductForRenewal = (entitlement: Entitlement): Product | null => {
    if (!products) return null;
    
    // Try to find by product_code matching tier or product id
    const product = products.find(p => 
      p.tier === entitlement.product_code || 
      p.id === entitlement.product_code
    );
    
    return product || null;
  };

  const handleRenew = (entitlement: Entitlement) => {
    const product = findProductForRenewal(entitlement);
    if (product) {
      setRenewProduct({
        id: product.id,
        name: product.name,
        price: product.price_byn,
      });
    } else {
      toast.error("Продукт для продления не найден");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="mr-1 h-3 w-3" />
            Оплачено
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Ошибка
          </Badge>
        );
      case "processing":
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" />
            В обработке
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEntitlementStatusBadge = (entitlement: Entitlement) => {
    const isExpired = entitlement.expires_at && new Date(entitlement.expires_at) < new Date();
    
    if (entitlement.status === "active" && !isExpired) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="mr-1 h-3 w-3" />
          Активна
        </Badge>
      );
    }
    
    if (isExpired) {
      return (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Истекла
        </Badge>
      );
    }
    
    return <Badge variant="outline">{entitlement.status}</Badge>;
  };

  const formatPrice = (amount: number, currency: string) => {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "d MMMM yyyy, HH:mm", { locale: ru });
  };

  const getProductCodeName = (code: string) => {
    const names: Record<string, string> = {
      pro: "PRO подписка",
      premium: "PREMIUM подписка",
      webinar: "Вебинар",
    };
    return names[code] || code;
  };

  const downloadReceipt = (order: Order) => {
    const priceFormatted = formatPrice(order.amount, order.currency);
    const dateFormatted = formatDate(order.created_at);
    
    const doc = new jsPDF();
    
    // Header background
    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, 210, 45, "F");
    
    // Logo text (placeholder for actual logo)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Gorbova Club", 105, 22, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("КВИТАНЦИЯ ОБ ОПЛАТЕ", 105, 35, { align: "center" });
    
    // Reset text color
    doc.setTextColor(51, 51, 51);
    
    // Order info section
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("ИНФОРМАЦИЯ О ЗАКАЗЕ", 20, 60);
    doc.setDrawColor(102, 126, 234);
    doc.line(20, 63, 190, 63);
    
    doc.setFont("helvetica", "normal");
    let y = 73;
    
    doc.text("Номер заказа:", 20, y);
    doc.text(order.id, 80, y);
    y += 8;
    
    doc.text("ID транзакции:", 20, y);
    doc.text(order.bepaid_uid || "—", 80, y);
    y += 8;
    
    doc.text("Дата и время:", 20, y);
    doc.text(dateFormatted, 80, y);
    y += 15;
    
    // Product section
    doc.setFont("helvetica", "bold");
    doc.text("ДЕТАЛИ ЗАКАЗА", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    doc.setFont("helvetica", "normal");
    doc.text("Продукт:", 20, y);
    doc.text(order.products?.name || "Подписка", 80, y);
    y += 8;
    
    doc.text("Тип:", 20, y);
    doc.text(
      order.products?.product_type === "subscription" ? "Подписка" : 
      order.products?.product_type === "webinar" ? "Вебинар" : "Разовая покупка",
      80, y
    );
    y += 15;
    
    // Payment section
    doc.setFont("helvetica", "bold");
    doc.text("ИНФОРМАЦИЯ ОБ ОПЛАТЕ", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    doc.setFont("helvetica", "normal");
    doc.text("Способ оплаты:", 20, y);
    doc.text(order.payment_method || "Банковская карта", 80, y);
    y += 8;
    
    doc.text("Статус:", 20, y);
    doc.setTextColor(16, 185, 129);
    doc.text("Оплачено", 80, y);
    doc.setTextColor(51, 51, 51);
    y += 8;
    
    doc.text("Email покупателя:", 20, y);
    doc.text(order.customer_email || "—", 80, y);
    y += 20;
    
    // Total section
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, y - 5, 170, 25, 3, 3, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ИТОГО:", 30, y + 10);
    doc.setTextColor(102, 126, 234);
    doc.text(priceFormatted, 180, y + 10, { align: "right" });
    doc.setTextColor(51, 51, 51);
    y += 35;
    
    // Footer
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    doc.text("Исполнитель: ЗАО «АЖУР инкам»", 105, y, { align: "center" });
    doc.text("УНП: 193405000", 105, y + 5, { align: "center" });
    doc.text("Адрес: 220035, г. Минск, ул. Панфилова, 2, офис 49Л", 105, y + 10, { align: "center" });
    doc.text("Email: info@ajoure.by", 105, y + 15, { align: "center" });
    y += 25;
    
    doc.setFontSize(8);
    doc.text("Данный документ сформирован автоматически и является подтверждением оплаты.", 105, y, { align: "center" });
    
    // Save the PDF
    doc.save(`receipt_${order.id.slice(0, 8)}_${format(new Date(order.created_at), "yyyyMMdd")}.pdf`);
    
    toast.success("PDF-чек скачан");
  };

  // Show all entitlements, including expired ones for renewal
  const allEntitlements = entitlements || [];
  
  const activeEntitlements = entitlements?.filter(e => {
    const isExpired = e.expires_at && new Date(e.expires_at) < new Date();
    return e.status === "active" && !isExpired;
  }) || [];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Мои покупки</h1>
          <p className="text-muted-foreground">История заказов и активные подписки</p>
        </div>

        {/* Active Subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Подписки
            </CardTitle>
            <CardDescription>
              Ваши текущие подписки и продукты
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entitlementsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : allEntitlements.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {allEntitlements.map((entitlement) => {
                  const isExpired = entitlement.expires_at && new Date(entitlement.expires_at) < new Date();
                  const isExpiringSoon = entitlement.expires_at && !isExpired && 
                    new Date(entitlement.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                  const renewalProduct = findProductForRenewal(entitlement);
                  
                  return (
                    <div
                      key={entitlement.id}
                      className={`rounded-lg border p-4 ${
                        isExpired 
                          ? "bg-muted/50 border-destructive/30" 
                          : isExpiringSoon 
                            ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30"
                            : "bg-gradient-to-br from-primary/5 to-accent/5"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {(entitlement.meta as Record<string, any>)?.product_name || getProductCodeName(entitlement.product_code)}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Активирована: {formatDate(entitlement.created_at)}
                          </p>
                          {entitlement.expires_at && (
                            <p className={`text-sm ${isExpired ? "text-destructive" : isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                              {isExpired ? "Истекла: " : "Действует до: "}{formatDate(entitlement.expires_at)}
                            </p>
                          )}
                        </div>
                        {getEntitlementStatusBadge(entitlement)}
                      </div>
                      
                      {(isExpired || isExpiringSoon) && renewalProduct && (
                        <Button
                          size="sm"
                          onClick={() => handleRenew(entitlement)}
                          className="w-full gap-2"
                          variant={isExpired ? "default" : "outline"}
                        >
                          <RefreshCw className="h-4 w-4" />
                          {isExpired ? "Продлить подписку" : "Продлить заранее"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>У вас пока нет подписок</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              История заказов
            </CardTitle>
            <CardDescription>
              Все ваши покупки и платежи
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : orders && orders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Продукт</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Способ оплаты</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.products?.name || "—"}
                      </TableCell>
                      <TableCell>
                        {formatPrice(order.amount, order.currency)}
                      </TableCell>
                      <TableCell>
                        {order.payment_method ? (
                          <span className="flex items-center gap-1">
                            <Receipt className="h-3 w-3" />
                            {order.payment_method}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right">
                        {order.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadReceipt(order)}
                            className="gap-1"
                          >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Чек</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>История покупок пуста</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Dialog for Renewal */}
      {renewProduct && (
        <PaymentDialog
          open={!!renewProduct}
          onOpenChange={(open) => !open && setRenewProduct(null)}
          productId={renewProduct.id}
          productName={renewProduct.name}
          price={`${(renewProduct.price / 100).toFixed(2)} BYN`}
        />
      )}
    </DashboardLayout>
  );
}
