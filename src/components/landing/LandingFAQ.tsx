import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedSection } from "./AnimatedSection";

const faqs = [
  {
    question: "Я новичок, мне будет сложно?",
    answer: "Нет! Контент подаётся простым языком. Мы начинаем с базовых понятий и постепенно идём к сложным темам. Многие участники начинали с нуля.",
  },
  {
    question: "Сколько времени нужно уделять?",
    answer: "Достаточно 10–15 минут в день для чтения дайджестов. Эфиры по четвергам длятся около часа, но их можно смотреть в записи в удобное время.",
  },
  {
    question: "Это окупится?",
    answer: "Одна ошибка может стоить сотни рублей штрафа. Одно правильное решение — тысячи экономии для бизнеса. Участники окупают членство многократно.",
  },
  {
    question: "Подойдёт ли для ИП / самозанятых?",
    answer: "Да! В Клубе есть материалы как для бухгалтеров компаний, так и для тех, кто ведёт учёт ИП или работает на себя.",
  },
  {
    question: "Можно ли отменить подписку?",
    answer: "Да, вы можете отменить подписку в любой момент. Доступ сохранится до конца оплаченного периода.",
  },
  {
    question: "Как задать вопрос эксперту?",
    answer: "В тарифах FULL и BUSINESS вы можете отправить вопрос и получить персональный видеоответ. Обычно ответ приходит в течение 1–2 рабочих дней.",
  },
];

export function LandingFAQ() {
  return (
    <section id="faq" className="py-20 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-muted/50 -z-10" />

      <div className="container mx-auto px-4">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Частые вопросы
          </h2>
          <p className="text-lg text-muted-foreground">
            Ответы на популярные вопросы о Клубе
          </p>
        </AnimatedSection>

        <div className="max-w-3xl mx-auto">
          <AnimatedSection animation="fade-up">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="rounded-xl border border-border/50 px-6 overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.7))",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-4">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
