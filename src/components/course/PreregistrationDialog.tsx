import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface PreregistrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tariffName?: string;
  productCode?: string;
}

export function PreregistrationDialog({ 
  open, 
  onOpenChange, 
  tariffName,
  productCode = "cb20_predzapis"
}: PreregistrationDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    consent: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.consent) {
      toast({
        title: "Необходимо согласие",
        description: "Пожалуйста, подтвердите согласие на обработку данных",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from("contact_requests")
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          subject: `Предзапись на курс: ${tariffName || "Ценный бухгалтер"}`,
          message: `Заявка на предзапись. Тариф: ${tariffName || "Не выбран"}. Код продукта: ${productCode}`,
          consent: formData.consent,
          status: "new"
        });

      if (error) throw error;

      toast({
        title: "Заявка отправлена!",
        description: "Мы свяжемся с вами в ближайшее время",
      });
      
      onOpenChange(false);
      setFormData({ name: "", email: "", phone: "", consent: false });
    } catch (error) {
      console.error("Error submitting preregistration:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось отправить заявку. Попробуйте позже.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Предзапись на курс</DialogTitle>
          <DialogDescription>
            {tariffName 
              ? `Тариф: ${tariffName}. Оставьте контакты, и мы свяжемся с вами.`
              : "Оставьте контакты, и мы свяжемся с вами для уточнения деталей."
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Имя *</Label>
            <Input
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ваше имя"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+375 (XX) XXX-XX-XX"
            />
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="consent"
              checked={formData.consent}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, consent: checked as boolean })
              }
            />
            <Label htmlFor="consent" className="text-sm text-muted-foreground leading-tight">
              Я согласен(а) на обработку персональных данных в соответствии с{" "}
              <a href="/privacy" className="text-primary hover:underline" target="_blank">
                политикой конфиденциальности
              </a>
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Отправка...
              </>
            ) : (
              "Отправить заявку"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
