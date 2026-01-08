import { AnimatedSection } from "@/components/landing/AnimatedSection";
import { TrendingUp, Shield, Award, Clock } from "lucide-react";

const results = [
  {
    icon: TrendingUp,
    value: "+40 000",
    label: "BYN/год",
    description: "Средний рост дохода выпускников"
  },
  {
    icon: Shield,
    value: "100%",
    label: "защита",
    description: "Уверенность при любых проверках"
  },
  {
    icon: Award,
    value: "Сертификат",
    label: "о прохождении",
    description: "Подтверждение квалификации"
  },
  {
    icon: Clock,
    value: "7",
    label: "недель",
    description: "До результата"
  }
];

export function CourseResults() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Что вы получите</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Конкретные результаты после прохождения курса
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {results.map((result, index) => (
            <AnimatedSection key={index} delay={index * 100}>
              <div className="bg-card rounded-xl p-6 border border-border text-center h-full">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <result.icon className="w-7 h-7 text-primary" />
                </div>
                <div className="text-3xl font-bold text-primary mb-1">{result.value}</div>
                <div className="text-sm font-medium mb-2">{result.label}</div>
                <p className="text-xs text-muted-foreground">{result.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
