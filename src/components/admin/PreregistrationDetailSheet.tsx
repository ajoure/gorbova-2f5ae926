import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Package,
  CalendarDays,
  MessageSquare,
  Send,
  Save,
  ExternalLink,
  Globe,
} from "lucide-react";
import { getProductName } from "@/lib/product-names";

interface Preregistration {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  product_code: string;
  tariff_name: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  consent: boolean;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  profiles?: {
    id: string;
    full_name: string | null;
    telegram_user_id: number | null;
    telegram_username: string | null;
  } | null;
}

interface PreregistrationDetailSheetProps {
  preregistration: Preregistration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusOptions = [
  { value: "new", label: "Новая", variant: "secondary" as const },
  { value: "confirmed", label: "Подтверждена", variant: "default" as const },
  { value: "contacted", label: "Связались", variant: "outline" as const },
  { value: "converted", label: "Оплачено", variant: "default" as const },
  { value: "cancelled", label: "Отменена", variant: "destructive" as const },
];

export function PreregistrationDetailSheet({
  preregistration,
  open,
  onOpenChange,
}: PreregistrationDetailSheetProps) {
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Reset form when preregistration changes
  useEffect(() => {
    if (preregistration) {
      setNewStatus(preregistration.status);
      setNotes(preregistration.notes || "");
    }
  }, [preregistration]);

  const updateMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes: string }) => {
      const { error } = await supabase
        .from("course_preregistrations")
        .update({
          status,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", preregistration!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Предзапись обновлена");
      queryClient.invalidateQueries({ queryKey: ["admin-preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["preregistration-stats"] });
    },
    onError: (error) => {
      console.error("Update error:", error);
      toast.error("Ошибка обновления");
    },
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async () => {
      if (!preregistration?.user_id || !preregistration?.profiles?.telegram_user_id) {
        throw new Error("Telegram не привязан");
      }

      const productName = getProductName(preregistration.product_code);

      const { data, error } = await supabase.functions.invoke("telegram-send-notification", {
        body: {
          user_id: preregistration.user_id,
          message_type: "custom",
          custom_message: `Здравствуйте, ${preregistration.name}!\n\nНапоминаем о вашей предзаписи на курс "${productName}".\n\nЕсли у вас есть вопросы, напишите нам!`,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Уведомление отправлено");
    },
    onError: (error) => {
      console.error("Notification error:", error);
      toast.error("Ошибка отправки уведомления");
    },
  });

  if (!preregistration) return null;

  const currentStatus = statusOptions.find((s) => s.value === preregistration.status);
  const productName = getProductName(preregistration.product_code);
  const hasTelegram = !!preregistration.profiles?.telegram_user_id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-xl">{preregistration.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={currentStatus?.variant || "secondary"}>
              {currentStatus?.label || preregistration.status}
            </Badge>
            {hasTelegram && (
              <Badge variant="outline" className="gap-1.5 bg-[#0088cc]/10 text-[#0088cc] border-[#0088cc]/30">
                <MessageSquare className="h-3 w-3" />
                Telegram
              </Badge>
            )}
          </div>

          {/* Contact Info Card */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <User className="h-4 w-4" />
              Контактные данные
            </h3>
            <div className="space-y-2.5 pl-1">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${preregistration.email}`} className="text-primary hover:underline truncate">
                  {preregistration.email}
                </a>
              </div>
              {preregistration.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${preregistration.phone}`} className="text-primary hover:underline">
                    {preregistration.phone}
                  </a>
                </div>
              )}
              {preregistration.profiles?.telegram_username && (
                <div className="flex items-center gap-3 text-sm">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={`https://t.me/${preregistration.profiles.telegram_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    @{preregistration.profiles.telegram_username}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Product Info Card */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Package className="h-4 w-4" />
              Продукт
            </h3>
            <div className="space-y-2.5 pl-1">
              <div className="text-sm font-medium">{productName}</div>
              {preregistration.tariff_name && (
                <div className="text-sm text-muted-foreground">
                  Тариф: {preregistration.tariff_name}
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span>
                  {format(new Date(preregistration.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                </span>
              </div>
              {preregistration.source && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  <span>Источник: {preregistration.source}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status Change */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Изменить статус</Label>
            <Select
              value={newStatus || preregistration.status}
              onValueChange={setNewStatus}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Заметки</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Добавить заметку..."
              rows={3}
              className="bg-background resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={() => updateMutation.mutate({
                status: newStatus || preregistration.status,
                notes,
              })}
              disabled={updateMutation.isPending}
              className="w-full"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
            </Button>

            {hasTelegram && (
              <Button
                variant="outline"
                onClick={() => sendNotificationMutation.mutate()}
                disabled={sendNotificationMutation.isPending}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendNotificationMutation.isPending ? "Отправка..." : "Отправить напоминание в Telegram"}
              </Button>
            )}

            {preregistration.user_id && (
              <Button
                variant="ghost"
                asChild
                className="w-full"
              >
                <a href={`/admin/contacts?search=${preregistration.email}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Открыть профиль клиента
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
