import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

// Cache for the loaded font
let fontLoaded = false;
let fontBase64: string | null = null;

// Load Roboto font that supports Cyrillic
async function loadCyrillicFont(): Promise<string> {
  if (fontBase64) return fontBase64;
  
  try {
    // Fetch Roboto Regular from Google Fonts CDN
    const response = await fetch(
      "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf"
    );
    const arrayBuffer = await response.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    fontBase64 = base64;
    return base64;
  } catch (error) {
    console.error("Failed to load Cyrillic font:", error);
    throw error;
  }
}

// Register font with jsPDF
function registerFont(doc: jsPDF, fontBase64: string): void {
  if (!fontLoaded) {
    doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    fontLoaded = true;
  }
}

interface OrderData {
  order_number: string;
  final_price: number;
  currency: string;
  is_trial: boolean;
  created_at: string;
  customer_email?: string | null;
  products_v2?: { name?: string; code?: string } | null;
  tariffs?: { name?: string; code?: string } | null;
  payments_v2?: Array<{
    provider_payment_id?: string | null;
    card_brand?: string | null;
    card_last4?: string | null;
  }>;
}

interface SubscriptionData {
  is_trial: boolean;
  products_v2?: { name?: string; code?: string } | null;
  tariffs?: { name?: string; code?: string } | null;
  orders_v2?: {
    order_number: string;
    final_price: number;
    currency: string;
    created_at: string;
    payments_v2?: Array<{
      provider_payment_id?: string | null;
      card_brand?: string | null;
      card_last4?: string | null;
    }>;
  } | null;
}

export async function generateOrderReceipt(order: OrderData): Promise<void> {
  try {
    toast.loading("Генерация квитанции...");
    
    const font = await loadCyrillicFont();
    const priceFormatted = `${order.final_price.toFixed(2)} ${order.currency}`;
    const dateFormatted = format(new Date(order.created_at), "d MMMM yyyy, HH:mm", { locale: ru });
    const payment = order.payments_v2?.[0];
    
    const doc = new jsPDF();
    
    // Register Cyrillic font
    doc.addFileToVFS("Roboto-Regular.ttf", font);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");
    
    // Header background
    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, 210, 45, "F");
    
    // Logo text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("Gorbova Club", 105, 22, { align: "center" });
    doc.setFontSize(12);
    doc.text("КВИТАНЦИЯ ОБ ОПЛАТЕ", 105, 35, { align: "center" });
    
    // Reset text color
    doc.setTextColor(51, 51, 51);
    
    // Order info section
    doc.setFontSize(10);
    doc.text("ИНФОРМАЦИЯ О ЗАКАЗЕ", 20, 60);
    doc.setDrawColor(102, 126, 234);
    doc.line(20, 63, 190, 63);
    
    let y = 73;
    
    doc.text("Номер заказа:", 20, y);
    doc.text(order.order_number, 80, y);
    y += 8;
    
    doc.text("ID транзакции:", 20, y);
    doc.text(payment?.provider_payment_id || "—", 80, y);
    y += 8;
    
    doc.text("Дата и время:", 20, y);
    doc.text(dateFormatted, 80, y);
    y += 15;
    
    // Product section
    doc.text("ДЕТАЛИ ЗАКАЗА", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    const productName = order.products_v2?.name || order.products_v2?.code || "Gorbova Club";
    const tariffName = order.tariffs?.name || order.tariffs?.code || "";
    const fullProductName = tariffName ? `${productName} — ${tariffName}` : productName;
    
    doc.text("Продукт:", 20, y);
    doc.text(fullProductName, 80, y);
    y += 8;
    
    doc.text("Тип:", 20, y);
    doc.text(order.is_trial ? "Пробный период" : "Подписка", 80, y);
    y += 15;
    
    // Payment section
    doc.text("ИНФОРМАЦИЯ ОБ ОПЛАТЕ", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    const paymentMethod = payment?.card_brand && payment?.card_last4
      ? `${payment.card_brand} **** ${payment.card_last4}`
      : order.is_trial && order.final_price === 0
        ? "Пробный период"
        : "Банковская карта";
    
    doc.text("Способ оплаты:", 20, y);
    doc.text(paymentMethod, 80, y);
    y += 8;
    
    doc.text("Статус:", 20, y);
    if (order.is_trial && order.final_price === 0) {
      doc.setTextColor(59, 130, 246);
      doc.text("Триал", 80, y);
    } else {
      doc.setTextColor(16, 185, 129);
      doc.text("Оплачено", 80, y);
    }
    doc.setTextColor(51, 51, 51);
    y += 8;
    
    if (order.customer_email) {
      doc.text("Email покупателя:", 20, y);
      doc.text(order.customer_email, 80, y);
      y += 12;
    } else {
      y += 4;
    }
    
    y += 8;
    
    // Total section
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, y - 5, 170, 25, 3, 3, "F");
    doc.setFontSize(14);
    doc.text("ИТОГО:", 30, y + 10);
    doc.setTextColor(102, 126, 234);
    doc.text(priceFormatted, 180, y + 10, { align: "right" });
    doc.setTextColor(51, 51, 51);
    y += 35;
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("Исполнитель: ЗАО «АЖУР инкам»", 105, y, { align: "center" });
    doc.text("УНП: 193405000", 105, y + 5, { align: "center" });
    doc.text("Адрес: 220035, г. Минск, ул. Панфилова, 2, офис 49Л", 105, y + 10, { align: "center" });
    doc.text("Email: info@ajoure.by", 105, y + 15, { align: "center" });
    y += 25;
    
    doc.setFontSize(8);
    doc.text("Данный документ сформирован автоматически и является подтверждением оплаты.", 105, y, { align: "center" });
    
    // Save the PDF
    doc.save(`receipt_${order.order_number}_${format(new Date(order.created_at), "yyyyMMdd")}.pdf`);
    
    toast.dismiss();
    toast.success("Квитанция скачана");
  } catch (error) {
    toast.dismiss();
    console.error("Error generating receipt:", error);
    toast.error("Ошибка генерации квитанции");
  }
}

export async function generateSubscriptionReceipt(sub: SubscriptionData): Promise<void> {
  const order = sub.orders_v2;
  if (!order) {
    toast.error("Заказ не найден для этой подписки");
    return;
  }
  
  try {
    toast.loading("Генерация квитанции...");
    
    const font = await loadCyrillicFont();
    const priceFormatted = `${order.final_price.toFixed(2)} ${order.currency}`;
    const dateFormatted = format(new Date(order.created_at), "d MMMM yyyy, HH:mm", { locale: ru });
    const payment = order.payments_v2?.[0];
    
    const doc = new jsPDF();
    
    // Register Cyrillic font
    doc.addFileToVFS("Roboto-Regular.ttf", font);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");
    
    // Header background
    doc.setFillColor(102, 126, 234);
    doc.rect(0, 0, 210, 45, "F");
    
    // Logo text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("Gorbova Club", 105, 22, { align: "center" });
    doc.setFontSize(12);
    doc.text("КВИТАНЦИЯ ОБ ОПЛАТЕ", 105, 35, { align: "center" });
    
    // Reset text color
    doc.setTextColor(51, 51, 51);
    
    // Order info section
    doc.setFontSize(10);
    doc.text("ИНФОРМАЦИЯ О ЗАКАЗЕ", 20, 60);
    doc.setDrawColor(102, 126, 234);
    doc.line(20, 63, 190, 63);
    
    let y = 73;
    
    doc.text("Номер заказа:", 20, y);
    doc.text(order.order_number, 80, y);
    y += 8;
    
    doc.text("ID транзакции:", 20, y);
    doc.text(payment?.provider_payment_id || "—", 80, y);
    y += 8;
    
    doc.text("Дата и время:", 20, y);
    doc.text(dateFormatted, 80, y);
    y += 15;
    
    // Product section
    doc.text("ДЕТАЛИ ЗАКАЗА", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    const productName = sub.products_v2?.name || sub.products_v2?.code || "Gorbova Club";
    const tariffName = sub.tariffs?.name || sub.tariffs?.code || "";
    const fullProductName = tariffName ? `${productName} — ${tariffName}` : productName;
    
    doc.text("Продукт:", 20, y);
    doc.text(fullProductName, 80, y);
    y += 8;
    
    doc.text("Тип:", 20, y);
    doc.text(sub.is_trial ? "Пробный период" : "Подписка", 80, y);
    y += 15;
    
    // Payment section
    doc.text("ИНФОРМАЦИЯ ОБ ОПЛАТЕ", 20, y);
    doc.line(20, y + 3, 190, y + 3);
    y += 13;
    
    const paymentMethod = payment?.card_brand && payment?.card_last4
      ? `${payment.card_brand} **** ${payment.card_last4}`
      : sub.is_trial && order.final_price === 0
        ? "Пробный период"
        : "Банковская карта";
    
    doc.text("Способ оплаты:", 20, y);
    doc.text(paymentMethod, 80, y);
    y += 8;
    
    doc.text("Статус:", 20, y);
    if (sub.is_trial && order.final_price === 0) {
      doc.setTextColor(59, 130, 246);
      doc.text("Триал", 80, y);
    } else {
      doc.setTextColor(16, 185, 129);
      doc.text("Оплачено", 80, y);
    }
    doc.setTextColor(51, 51, 51);
    y += 20;
    
    // Total section
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(20, y - 5, 170, 25, 3, 3, "F");
    doc.setFontSize(14);
    doc.text("ИТОГО:", 30, y + 10);
    doc.setTextColor(102, 126, 234);
    doc.text(priceFormatted, 180, y + 10, { align: "right" });
    doc.setTextColor(51, 51, 51);
    y += 35;
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("Исполнитель: ЗАО «АЖУР инкам»", 105, y, { align: "center" });
    doc.text("УНП: 193405000", 105, y + 5, { align: "center" });
    doc.text("Адрес: 220035, г. Минск, ул. Панфилова, 2, офис 49Л", 105, y + 10, { align: "center" });
    doc.text("Email: info@ajoure.by", 105, y + 15, { align: "center" });
    y += 25;
    
    doc.setFontSize(8);
    doc.text("Данный документ сформирован автоматически и является подтверждением оплаты.", 105, y, { align: "center" });
    
    // Save the PDF
    doc.save(`receipt_${order.order_number}_${format(new Date(order.created_at), "yyyyMMdd")}.pdf`);
    
    toast.dismiss();
    toast.success("Квитанция скачана");
  } catch (error) {
    toast.dismiss();
    console.error("Error generating receipt:", error);
    toast.error("Ошибка генерации квитанции");
  }
}
