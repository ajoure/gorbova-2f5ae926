import { Check, X } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const forWhom = [
  "Если боитесь ошибиться в законах — каждый приказ как ребус",
  "Если пугает личная ответственность — протоколы, штрафы на ваших плечах",
  "Если устали от давления руководства — «Сделай так, чтобы проверка не придралась»",
  "Если надоела пустая теория — красиво рассказывают, но непонятно что делать",
  "Если работаете в одиночку — нет коллеги для совета",
  "Если хочется зарабатывать больше — без знаний чек не поднять",
];

const notFor = [
  "Тем, кто ищет «чудо-кнопку» — всё само решится",
  "Тем, кто хочет «серые схемы» — обойти налоги любой ценой",
  "Тем, кто не готов вкладывать 10–15 минут в день в обучение",
];

export function LandingAudience() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
          {/* For whom */}
          <AnimatedSection animation="fade-right">
            <div
              className="p-8 rounded-2xl border border-primary/20 h-full"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.7))",
                backdropFilter: "blur(20px)",
              }}
            >
              <h3 className="text-2xl font-bold text-foreground mb-6">
                ✅ Кому подойдёт Клуб?
              </h3>
              <ul className="space-y-4">
                {forWhom.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="text-primary" size={14} />
                    </div>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedSection>

          {/* Not for */}
          <AnimatedSection animation="fade-left">
            <div
              className="p-8 rounded-2xl border border-muted h-full"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.7))",
                backdropFilter: "blur(20px)",
              }}
            >
              <h3 className="text-2xl font-bold text-foreground mb-6">
                ❌ Кому не подойдёт?
              </h3>
              <ul className="space-y-4">
                {notFor.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <X className="text-muted-foreground" size={14} />
                    </div>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
