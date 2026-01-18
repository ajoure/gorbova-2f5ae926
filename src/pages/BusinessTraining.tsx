import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { PreregistrationDialog } from "@/components/course/PreregistrationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePublicProduct } from "@/hooks/usePublicProduct";
import { 
  Calendar, 
  CheckCircle, 
  Users, 
  Video, 
  MessageSquare,
  ArrowRight,
  CreditCard,
  Bell,
  Briefcase,
  TrendingUp,
  Clock,
  Check,
  ArrowLeft
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

import katerinaImage from "@/assets/katerina-business.jpg";

const benefits = [
  {
    icon: Video,
    title: "Ежемесячные вебинары",
    description: "Live-тренинги с Катериной Горбовой + записи",
  },
  {
    icon: Briefcase,
    title: "От найма к бизнесу",
    description: "Пошаговый план построения своей практики",
  },
  {
    icon: Users,
    title: "Закрытое сообщество",
    description: "Нетворкинг с единомышленниками",
  },
  {
    icon: MessageSquare,
    title: "Обратная связь",
    description: "Домашние задания с проверкой от эксперта",
  },
];

const whatIncluded = [
  "1 обучающий вебинар в месяц (live + запись)",
  "Чат с участниками и экспертом",
  "Домашние задания с обратной связью",
  "Шаблоны и чек-листы для старта бизнеса",
  "Прогресс-трекер вашего пути",
];

export default function BusinessTraining() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showPreregistration, setShowPreregistration] = useState(false);

  // Fetch dynamic product data from API
  const { data: productData } = usePublicProduct("business-training.gorbova.by", user?.id);

  // Extract dynamic settings from product data
  const dynamicSettings = useMemo(() => {
    if (!productData?.tariffs?.[0]) {
      return {
        startDate: "5 февраля 2026",
        price: 250,
        chargeWindowStart: 1,
        chargeWindowEnd: 4,
        notifyDays: 1,
        tariffName: "Ежемесячный доступ",
      };
    }

    const tariff = productData.tariffs[0];
    const preregOffer = tariff.offers.find(o => o.offer_type === "preregistration");
    const payNowOffer = tariff.offers.find(o => o.offer_type === "pay_now" && o.is_primary);
    
    const preregMeta = preregOffer?.meta?.preregistration;
    const payNowMeta = payNowOffer?.meta;
    
    const chargeDate = preregMeta?.first_charge_date;
    
    let formattedStartDate = "5 февраля 2026";
    if (chargeDate) {
      try {
        formattedStartDate = format(new Date(chargeDate), "d MMMM yyyy", { locale: ru });
      } catch {}
    }

    return {
      startDate: formattedStartDate,
      price: payNowOffer?.amount || 250,
      chargeWindowStart: preregMeta?.charge_window_start || payNowMeta?.charge_window_start || 1,
      chargeWindowEnd: preregMeta?.charge_window_end || payNowMeta?.charge_window_end || 4,
      notifyDays: preregMeta?.notify_before_days || 1,
      tariffName: tariff.name || "Ежемесячный доступ",
    };
  }, [productData]);

  // Dynamic payment terms based on product settings
  const paymentTerms = useMemo(() => [
    { icon: CreditCard, text: "Привязка карты в личном кабинете" },
    { icon: Bell, text: `Уведомление за ${dynamicSettings.notifyDays} ${dynamicSettings.notifyDays === 1 ? "день" : "дня"} до списания` },
    { icon: Calendar, text: `Автосписание с ${dynamicSettings.chargeWindowStart} по ${dynamicSettings.chargeWindowEnd} число месяца` },
  ], [dynamicSettings]);

  // Check if user has existing booking or active subscription
  const { data: existingAccess } = useQuery({
    queryKey: ["buh-business-landing-access", user?.id],
    queryFn: async () => {
      if (!user?.id) return { hasPreregistration: false, hasActiveSubscription: false };
      
      // Check preregistration
      const { data: preregistration } = await supabase
        .from("course_preregistrations")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("product_code", "buh_business")
        .in("status", ["new", "contacted"])
        .maybeSingle();
      
      // Check entitlements
      const { data: entitlement } = await supabase
        .from("entitlements")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("product_code", "buh_business")
        .eq("status", "active")
        .maybeSingle();
      
      return {
        hasPreregistration: !!preregistration,
        hasActiveSubscription: !!entitlement,
      };
    },
    enabled: !!user?.id,
  });

  const hasAccess = existingAccess?.hasPreregistration || existingAccess?.hasActiveSubscription;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Back to Dashboard Button */}
      <div className="container mx-auto px-4 pt-4">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate("/learning")}
          className="hover:bg-card/50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          В личный кабинет
        </Button>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <div className="space-y-6 z-10">
              <Badge 
                variant="secondary" 
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 px-4 py-1.5"
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Старт {dynamicSettings.startDate}
              </Badge>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                Бухгалтерия как бизнес
              </h1>

              <p className="text-lg text-muted-foreground max-w-xl">
                Построй бизнес на исключительном профессионализме со стабильными продажами 
                и высоким удержанием клиентов
              </p>

              {/* Benefits grid */}
              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                {benefits.map((benefit, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-card/40 backdrop-blur-sm border border-border/30"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                      <benefit.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{benefit.title}</p>
                      <p className="text-xs text-muted-foreground">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Existing access badge */}
              {hasAccess && (
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={existingAccess?.hasActiveSubscription 
                      ? "bg-emerald-500/10 text-emerald-600 border-0 px-3 py-1.5" 
                      : "bg-amber-500/20 text-amber-600 border-0 px-3 py-1.5"
                    }
                  >
                    {existingAccess?.hasActiveSubscription ? (
                      <><Check className="h-3.5 w-3.5 mr-1.5" /> Активный доступ</>
                    ) : (
                      <><Clock className="h-3.5 w-3.5 mr-1.5" /> У вас есть бронь</>
                    )}
                  </Badge>
                </div>
              )}

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                {hasAccess ? (
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={() => navigate("/library/buh-business")}
                  >
                    Перейти к тренингу
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={() => setShowPreregistration(true)}
                  >
                    Забронировать место
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => navigate("/auth")}
                >
                  Войти в кабинет
                </Button>
              </div>
            </div>

            {/* Image */}
            <div className="relative lg:order-last">
              <div className="relative z-10">
                <GlassCard className="p-2 overflow-hidden">
                  <img 
                    src={katerinaImage} 
                    alt="Катерина Горбова — эксперт по бухгалтерии" 
                    className="w-full h-auto max-h-[500px] object-cover rounded-lg"
                    style={{ objectPosition: "center 15%", transform: "scale(1.2)" }}
                  />
                </GlassCard>
                
                {/* Floating badge */}
                <div className="absolute -bottom-4 -left-4 z-20">
                  <GlassCard className="px-4 py-3 flex items-center gap-3 bg-card/90 backdrop-blur-xl border-primary/20">
                    <div className="p-2 rounded-full bg-primary/10 text-primary">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Катерина Горбова</p>
                      <p className="text-xs text-muted-foreground">Эксперт, 15+ лет опыта</p>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-full h-full bg-gradient-to-br from-primary/20 to-transparent rounded-2xl -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-12 lg:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <GlassCard className="p-8 lg:p-10 backdrop-blur-xl bg-card/60 border-primary/10">
              <div className="text-center mb-8">
                <Badge variant="outline" className="mb-4">
                  Один тариф — всё включено
                </Badge>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2">
                  {dynamicSettings.tariffName}
                </h2>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl lg:text-5xl font-bold text-primary">{dynamicSettings.price}</span>
                  <span className="text-xl text-muted-foreground">BYN/месяц</span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* What's included */}
                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    Что входит
                  </h3>
                  <ul className="space-y-3">
                    {whatIncluded.map((item, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Payment terms */}
                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Условия оплаты
                  </h3>
                  <ul className="space-y-3">
                    {paymentTerms.map((term, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <term.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{term.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-4 p-3 rounded-lg bg-muted/30">
                    Отмена подписки в любой момент в личном кабинете. 
                    При неуспешном списании доступ приостанавливается.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center space-y-4">
                {hasAccess ? (
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto px-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={() => navigate("/library/buh-business")}
                  >
                    Перейти к тренингу
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    size="lg" 
                    className="w-full sm:w-auto px-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                    onClick={() => setShowPreregistration(true)}
                  >
                    Забронировать место
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Нажимая кнопку, вы соглашаетесь с{" "}
                  <a href="/offer" className="underline hover:text-foreground">Офертой</a>
                  {" "}и{" "}
                  <a href="/privacy" className="underline hover:text-foreground">Политикой конфиденциальности</a>
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Preregistration Dialog */}
      <PreregistrationDialog
        open={showPreregistration}
        onOpenChange={setShowPreregistration}
        tariffName={`${dynamicSettings.tariffName} — ${dynamicSettings.price} BYN/мес`}
        productCode="buh_business"
      />
    </div>
  );
}
