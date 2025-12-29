import { Calendar, Video, BookOpen, MessageCircle, FileText } from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Ежедневные дайджесты",
    description: "Каждый день — свежая подборка изменений в законодательстве простым языком",
  },
  {
    icon: Video,
    title: "Еженедельные эфиры",
    description: "По четвергам — прямые эфиры с разбором актуальных вопросов и ответами на ваши вопросы",
  },
  {
    icon: BookOpen,
    title: "База знаний: 600+ видео",
    description: "Видеоразборы реальных ситуаций — ответы на вопросы, которые задавали коллеги",
  },
  {
    icon: FileText,
    title: "Ежемесячные обзоры",
    description: "Подробный обзор всех изменений за месяц — чтобы ничего не упустить",
  },
  {
    icon: MessageCircle,
    title: "Личные видеоответы",
    description: "Задайте вопрос — получите персональный видеоответ от эксперта",
  },
];

export function LandingContent() {
  return (
    <section id="content" className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Наполнение Клуба
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Всё, что нужно для уверенной работы бухгалтера
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-6 rounded-2xl border border-border/50 transition-all duration-300 hover:shadow-lg"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.7))",
                backdropFilter: "blur(20px)",
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <feature.icon className="text-primary" size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
