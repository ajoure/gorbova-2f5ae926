import { AnimatedSection } from "@/components/landing/AnimatedSection";
import { CheckCircle2, Award, Users, FileCheck } from "lucide-react";

const stats = [
  { icon: Award, value: "12+", label: "лет опыта" },
  { icon: Users, value: "2500+", label: "клиентов" },
  { icon: FileCheck, value: "400+", label: "проверок" },
];

export function CourseExpert() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ваш эксперт</h2>
          </div>
        </AnimatedSection>

        <div className="max-w-4xl mx-auto">
          <AnimatedSection delay={100}>
            <div className="bg-card rounded-2xl p-8 border border-border">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="w-48 h-48 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <span className="text-6xl font-bold text-primary">КГ</span>
                </div>
                
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-2xl font-bold mb-2">Катерина Горбова</h3>
                  <p className="text-primary font-medium mb-4">
                    Аудитор, налоговый консультант, эксперт по методологии бухучета
                  </p>
                  
                  <div className="flex flex-wrap justify-center md:justify-start gap-6 mb-6">
                    {stats.map((stat, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <stat.icon className="w-5 h-5 text-primary" />
                        <span className="font-bold">{stat.value}</span>
                        <span className="text-muted-foreground text-sm">{stat.label}</span>
                      </div>
                    ))}
                  </div>
                  
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Аттестованный аудитор Республики Беларусь</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Создатель клуба «Буква Закона» для бухгалтеров</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Автор методики подготовки к налоговым проверкам</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
