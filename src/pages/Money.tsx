import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { CashFlowTable } from "@/components/money/CashFlowTable";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  Briefcase, 
  ShieldCheck, 
  Wallet, 
  Play, 
  Headphones,
  BookOpen,
  FileText,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Lock
} from "lucide-react";

// Mock data for Business tab
const businessMaterials = [
  {
    id: "1",
    type: "video",
    title: "Как правильно оформить договор с клиентом",
    description: "Разбираем ключевые пункты договора, которые защитят ваш бизнес от рисков.",
    badge: "Видео + ДЗ",
    duration: "45 мин",
  },
  {
    id: "2",
    type: "video",
    title: "Налоговое планирование для ИП",
    description: "Законные способы оптимизации налоговой нагрузки для индивидуальных предпринимателей.",
    badge: "Видео + ДЗ",
    duration: "60 мин",
  },
  {
    id: "3",
    type: "podcast",
    title: "Разговор о финансовой грамотности",
    description: "Обсуждаем базовые принципы управления деньгами в бизнесе с экспертом.",
    badge: "Подкаст + ТЗ",
    duration: "32 мин",
  },
  {
    id: "4",
    type: "podcast",
    title: "Ошибки начинающих предпринимателей",
    description: "Топ-10 финансовых ошибок и как их избежать на старте бизнеса.",
    badge: "Подкаст + ТЗ",
    duration: "28 мин",
  },
];

// Mock data for Security tab (formerly Audits/Проверки)
const securitySituations = [
  {
    id: "1",
    situation: "Вызов в налоговую инспекцию",
    description: "Получили повестку о вызове в ИМНС для дачи пояснений по декларации.",
    solution: "1. Не паникуйте — это стандартная процедура.\n2. Подготовьте все документы, указанные в повестке.\n3. Изучите свою декларацию заранее.\n4. При необходимости возьмите с собой бухгалтера или юриста.\n5. Отвечайте только на заданные вопросы.",
    severity: "medium",
  },
  {
    id: "2",
    situation: "Запрос документов по статье 107 НК",
    description: "Налоговая запросила большой пакет документов в рамках камеральной проверки.",
    solution: "1. Проверьте законность запроса и сроки предоставления.\n2. Соберите только те документы, которые указаны в требовании.\n3. Подготовьте сопроводительное письмо с описью.\n4. Сохраните копию всех переданных документов.\n5. Зафиксируйте дату передачи.",
    severity: "high",
  },
  {
    id: "3",
    situation: "Блокировка расчетного счета",
    description: "Банк заблокировал счет и требует пояснения по операциям.",
    solution: "1. Свяжитесь с банком для уточнения причины блокировки.\n2. Запросите письменное уведомление с перечнем нужных документов.\n3. Подготовьте пояснительную записку по каждой операции.\n4. Предоставьте договоры и акты по сомнительным платежам.\n5. Контролируйте сроки рассмотрения.",
    severity: "high",
  },
  {
    id: "4",
    situation: "Проверка трудовой инспекции",
    description: "Уведомление о плановой проверке соблюдения трудового законодательства.",
    solution: "1. Проверьте наличие всех трудовых договоров.\n2. Убедитесь в правильности начисления зарплат.\n3. Подготовьте табели учета рабочего времени.\n4. Проверьте документы по охране труда.\n5. Назначьте ответственного за взаимодействие с инспектором.",
    severity: "low",
  },
];

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "high":
      return "bg-destructive/20 text-destructive border-destructive/30";
    case "medium":
      return "bg-warning/20 text-warning border-warning/30";
    case "low":
      return "bg-success/20 text-success border-success/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case "high":
      return <AlertTriangle className="h-4 w-4" />;
    case "medium":
      return <FileText className="h-4 w-4" />;
    case "low":
      return <CheckCircle className="h-4 w-4" />;
    default:
      return null;
  }
};

const Money = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("business");

  // Check if user has access to "Бухгалтерия как бизнес" product
  const { data: hasBusinessAccess } = useQuery({
    queryKey: ["buh-business-access", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      // Check entitlements for product access
      const { data: entitlement } = await supabase
        .from("entitlements")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("product_code", "buh_business")
        .in("status", ["active", "trial"])
        .maybeSingle();
      
      return !!entitlement;
    },
    enabled: !!user?.id,
  });
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Деньги</h1>
          <p className="text-muted-foreground">
            Обучение, безопасность бизнеса и личные финансы
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 backdrop-blur-xl bg-muted/30 border border-border/30 rounded-xl p-1">
            <TabsTrigger 
              value="business" 
              className="flex items-center gap-2 data-[state=active]:bg-card/60 rounded-lg"
            >
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Бизнес</span>
            </TabsTrigger>
            <TabsTrigger 
              value="security" 
              className="flex items-center gap-2 data-[state=active]:bg-card/60 rounded-lg"
            >
              <ShieldCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Безопасность</span>
            </TabsTrigger>
            <TabsTrigger 
              value="personal" 
              className="flex items-center gap-2 data-[state=active]:bg-card/60 rounded-lg"
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Личные финансы</span>
            </TabsTrigger>
          </TabsList>

          {/* Business Tab */}
          <TabsContent value="business" className="mt-6">
            {/* Promo for Business Training if no access */}
            {!hasBusinessAccess && (
              <GlassCard className="p-6 mb-6 bg-gradient-to-br from-primary/5 to-blue-500/5 border-primary/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                        Новинка
                      </Badge>
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Бухгалтерия как бизнес</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Ежемесячный тренинг: от бухгалтера в найме к владельцу своего бизнеса. 
                      Получите доступ к вебинарам и сообществу профессионалов.
                    </p>
                  </div>
                  <Button 
                    onClick={() => navigate("/business-training")}
                    className="shrink-0"
                  >
                    Записаться — 250 BYN/мес
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </GlassCard>
            )}

            {/* Business Training Content (if has access) */}
            {hasBusinessAccess && (
              <GlassCard className="p-6 mb-6 border-emerald-500/30 bg-emerald-500/5">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Briefcase className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">Бухгалтерия как бизнес</h3>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Доступ активен
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Следующий тренинг: 3 февраля в 19:00. Тема: «Поиск первых клиентов на бухгалтерские услуги»
                    </p>
                    <Button variant="outline" size="sm">
                      <Play className="h-4 w-4 mr-2" />
                      Перейти к материалам
                    </Button>
                  </div>
                </div>
              </GlassCard>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {businessMaterials.map((material) => (
                <GlassCard key={material.id} className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        material.type === "video" 
                          ? "bg-primary/10 text-primary" 
                          : "bg-accent/10 text-accent-foreground"
                      }`}>
                        {material.type === "video" ? (
                          <Play className="h-5 w-5" />
                        ) : (
                          <Headphones className="h-5 w-5" />
                        )}
                      </div>
                      <Badge 
                        variant="secondary" 
                        className="text-xs backdrop-blur-sm bg-secondary/50"
                      >
                        {material.badge}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {material.duration}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold leading-tight">{material.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {material.description}
                    </p>
                  </div>

                  <Button 
                    variant="outline" 
                    className="w-full backdrop-blur-sm bg-background/50"
                  >
                    {material.type === "video" ? (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        Смотреть урок
                      </>
                    ) : (
                      <>
                        <Headphones className="h-4 w-4 mr-2" />
                        Слушать
                      </>
                    )}
                  </Button>
                </GlassCard>
              ))}
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <ShieldCheck className="h-4 w-4" />
                <span>Разбор типичных ситуаций и алгоритмы действий</span>
              </div>

              <div className="grid gap-4">
                {securitySituations.map((item) => (
                  <GlassCard key={item.id} className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getSeverityColor(item.severity)}`}
                          >
                            {getSeverityIcon(item.severity)}
                            <span className="ml-1">
                              {item.severity === "high" ? "Срочно" : 
                               item.severity === "medium" ? "Важно" : "Информация"}
                            </span>
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-lg">{item.situation}</h3>
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="bg-muted/30 backdrop-blur-sm rounded-lg p-4 border border-border/30">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Решение</span>
                      </div>
                      <div className="text-sm text-muted-foreground whitespace-pre-line">
                        {item.solution}
                      </div>
                    </div>

                    <Button 
                      variant="secondary" 
                      className="w-full backdrop-blur-sm"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Записаться на консультацию
                    </Button>
                  </GlassCard>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Personal Finance Tab */}
          <TabsContent value="personal" className="mt-6">
            <GlassCard className="p-6">
              <CashFlowTable />
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Money;
