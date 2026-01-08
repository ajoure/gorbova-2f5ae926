import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Monitor, Users } from "lucide-react";
import { AnimatedSection } from "@/components/landing/AnimatedSection";

const courseInfo = [
  { icon: Calendar, label: "Старт", value: "21 июня 2025" },
  { icon: Clock, label: "Длительность", value: "7 недель" },
  { icon: Monitor, label: "Формат", value: "Онлайн" },
  { icon: Users, label: "Группа", value: "до 30 человек" },
];

interface CourseHeroProps {
  onScrollToTariffs?: () => void;
}

export function CourseHero({ onScrollToTariffs }: CourseHeroProps) {
  const handleScrollToTariffs = () => {
    if (onScrollToTariffs) {
      onScrollToTariffs();
    } else {
      const element = document.getElementById('tariffs');
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center py-20 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <AnimatedSection>
            <Badge variant="secondary" className="mb-6 text-sm px-4 py-1">
              Курс по методологии бухгалтерского учета
            </Badge>
          </AnimatedSection>

          <AnimatedSection delay={100}>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              ЦЕННЫЙ БУХГАЛТЕР
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Освойте методологию бухучета и научитесь уверенно проходить любые проверки. 
              25 модулей практических знаний от аудитора с 12-летним опытом.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={300}>
            <div className="flex flex-wrap justify-center gap-4 mb-10">
              {courseInfo.map((item, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 bg-card/50 backdrop-blur-sm border border-border rounded-lg px-4 py-2"
                >
                  <item.icon className="w-4 h-4 text-primary" />
                  <span className="text-sm">
                    <span className="text-muted-foreground">{item.label}:</span>{" "}
                    <span className="font-medium">{item.value}</span>
                  </span>
                </div>
              ))}
            </div>
          </AnimatedSection>

          <AnimatedSection delay={400}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={handleScrollToTariffs} className="text-lg px-8">
                Записаться на курс
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => {
                  const element = document.getElementById('program');
                  element?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-lg px-8"
              >
                Смотреть программу
              </Button>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
