import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check, Star } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const plans = [
  {
    name: "CHAT",
    price: "100",
    period: "BYN/мес",
    description: "Для быстрого старта",
    features: [
      "Доступ к сообществу",
      "Канал с дайджестами",
      "Еженедельные эфиры",
      "Чат с коллегами",
    ],
    popular: false,
  },
  {
    name: "FULL",
    price: "150",
    period: "BYN/мес",
    description: "Самый популярный",
    features: [
      "Всё из тарифа CHAT",
      "База знаний: 600+ видео",
      "Личные видеоответы на вопросы",
      "Архив всех эфиров",
    ],
    popular: true,
  },
  {
    name: "BUSINESS",
    price: "250",
    period: "BYN/мес",
    description: "Для бизнеса и роста",
    features: [
      "Всё из тарифа FULL",
      "«Библиотека решений»",
      "База по бизнесу и саморазвитию",
      "4-часовые глубокие вебинары",
      "Приоритетная поддержка",
    ],
    popular: false,
  },
];

export function LandingPricing() {
  const navigate = useNavigate();

  const handleSelectPlan = (planName: string) => {
    console.log(`[Analytics] click_pricing_plan_${planName.toLowerCase()}`);
    navigate("/auth?mode=signup");
  };

  return (
    <section id="pricing" className="py-20 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-primary/5 -z-10" />

      <div className="container mx-auto px-4">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Тарифы Клуба
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Выберите подходящий формат участия
          </p>
        </AnimatedSection>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <AnimatedSection key={index} animation="fade-up" delay={index * 150}>
              <div
                className={`relative p-6 rounded-2xl border transition-all duration-300 hover:shadow-xl h-full flex flex-col ${
                  plan.popular
                    ? "border-primary shadow-lg scale-105"
                    : "border-border/50"
                }`}
                style={{
                  background: "linear-gradient(135deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.85))",
                  backdropFilter: "blur(20px)",
                }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1">
                    <Star size={14} />
                    Популярный
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="text-primary" size={12} />
                      </div>
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSelectPlan(plan.name)}
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                >
                  Выбрать тариф
                </Button>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
