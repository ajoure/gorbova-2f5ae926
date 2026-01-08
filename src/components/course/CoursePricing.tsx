import { AnimatedSection } from "@/components/landing/AnimatedSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";

interface CourseTariff {
  name: string;
  price: number;
  originalPrice?: number;
  description: string;
  features: string[];
  isPopular?: boolean;
  isTrial?: boolean;
}

const tariffs: CourseTariff[] = [
  {
    name: "Самостоятельный",
    price: 590,
    originalPrice: 790,
    description: "Для тех, кто готов учиться самостоятельно",
    features: [
      "Доступ ко всем 25 модулям",
      "Видеоуроки в записи",
      "Рабочие материалы и шаблоны",
      "Доступ к чату участников",
      "Сертификат о прохождении"
    ]
  },
  {
    name: "С поддержкой",
    price: 990,
    originalPrice: 1290,
    description: "Оптимальный выбор с обратной связью",
    features: [
      "Всё из тарифа «Самостоятельный»",
      "Проверка домашних заданий",
      "Ответы на вопросы в чате",
      "Еженедельные Q&A сессии",
      "Разбор ваших кейсов"
    ],
    isPopular: true
  },
  {
    name: "VIP",
    price: 1990,
    originalPrice: 2490,
    description: "Максимум внимания и индивидуальная работа",
    features: [
      "Всё из тарифа «С поддержкой»",
      "3 личные консультации с экспертом",
      "Приоритетная проверка заданий",
      "Индивидуальный план развития",
      "Доступ к закрытому клубу на 3 месяца"
    ]
  }
];

interface CoursePricingProps {
  onPreregister?: (tariff: CourseTariff) => void;
  onPurchase?: (tariff: CourseTariff) => void;
}

export function CoursePricing({ onPreregister, onPurchase }: CoursePricingProps) {
  return (
    <section id="tariffs" className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Тарифы</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Выберите подходящий формат обучения
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tariffs.map((tariff, index) => (
            <AnimatedSection key={index} delay={index * 100}>
              <div className={`relative bg-card rounded-2xl p-6 border h-full flex flex-col ${
                tariff.isPopular 
                  ? 'border-primary shadow-lg shadow-primary/10' 
                  : 'border-border'
              }`}>
                {tariff.isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Популярный
                  </Badge>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-2">{tariff.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{tariff.description}</p>
                  
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-4xl font-bold">{tariff.price}</span>
                    <span className="text-muted-foreground">BYN</span>
                  </div>
                  {tariff.originalPrice && (
                    <div className="text-sm text-muted-foreground line-through">
                      {tariff.originalPrice} BYN
                    </div>
                  )}
                </div>
                
                <ul className="space-y-3 mb-6 flex-1">
                  {tariff.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    variant={tariff.isPopular ? "default" : "outline"}
                    onClick={() => onPurchase?.(tariff)}
                  >
                    Оплатить
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="ghost"
                    onClick={() => onPreregister?.(tariff)}
                  >
                    Предзапись
                  </Button>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
        
        <AnimatedSection delay={400}>
          <p className="text-center text-sm text-muted-foreground mt-8">
            Возможна оплата в рассрочку. Свяжитесь с нами для уточнения условий.
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
