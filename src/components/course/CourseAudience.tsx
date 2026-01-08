import { GraduationCap, Briefcase, Users, BookOpen, Scale, Building2 } from "lucide-react";
import { AnimatedSection } from "@/components/landing/AnimatedSection";

const audienceCards = [
  {
    icon: GraduationCap,
    title: "Новичкам в бухгалтерии",
    description: "Кто хочет освоить профессию с нуля и получить системные знания"
  },
  {
    icon: Briefcase,
    title: "Бухгалтерам с опытом",
    description: "Кто хочет углубить знания и повысить свою ценность на рынке"
  },
  {
    icon: Users,
    title: "Главным бухгалтерам",
    description: "Кто хочет уверенно проходить проверки и защищать компанию"
  },
  {
    icon: BookOpen,
    title: "Студентам",
    description: "Кто хочет получить практические навыки параллельно с теорией"
  },
  {
    icon: Scale,
    title: "Юристам",
    description: "Кто хочет понимать бухгалтерский учет для комплексного консалтинга"
  },
  {
    icon: Building2,
    title: "Предпринимателям",
    description: "Кто хочет контролировать финансы и понимать своего бухгалтера"
  }
];

export function CourseAudience() {
  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Для кого этот курс?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Курс подойдет специалистам с разным уровнем подготовки
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {audienceCards.map((card, index) => (
            <AnimatedSection key={index} delay={index * 100}>
              <div className="bg-card rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 h-full">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <card.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{card.title}</h3>
                <p className="text-muted-foreground text-sm">{card.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
