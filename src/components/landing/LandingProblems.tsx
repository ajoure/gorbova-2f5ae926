import { AlertTriangle, HelpCircle, FileWarning, Brain } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const problems = [
  {
    icon: HelpCircle,
    title: "Директор задает вопросы по бизнесу",
    description: "Ждет гениальных решений: как и налоги уменьшить, и под уклонение не попасть?",
  },
  {
    icon: AlertTriangle,
    title: "Запросы от налоговой участились",
    description: "Как оценить, будет ли безопасно и стоит ли предоставлять все пояснения и документы?",
  },
  {
    icon: FileWarning,
    title: "Обнаружена ошибка",
    description: "Как уметь исправлять любые ошибки или снижать штрафы до нуля, даже если уже вызывают на протокол?",
  },
  {
    icon: Brain,
    title: "Бесконечные сомнения",
    description: "Даже опытный бухгалтер не всегда уверен, всё ли учтено правильно, не подкопается ли проверка?",
  },
];

export function LandingProblems() {
  return (
    <section className="py-20 relative">
      <div className="container mx-auto px-4">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Каждый день бухгалтера полон новых задач
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Знакомые ситуации, которые отнимают силы и нервы?
          </p>
        </AnimatedSection>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {problems.map((problem, index) => (
            <AnimatedSection key={index} animation="fade-up" delay={index * 100}>
              <div
                className="p-6 rounded-2xl border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.7))",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <problem.icon className="text-destructive" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">{problem.title}</h3>
                    <p className="text-muted-foreground">{problem.description}</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
