import { AnimatedSection } from "@/components/landing/AnimatedSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen } from "lucide-react";

const modules = [
  {
    title: "Модуль 1. Введение в методологию",
    description: "Основы построения учетной политики, нормативная база, принципы организации бухгалтерского учета"
  },
  {
    title: "Модуль 2. Документооборот",
    description: "Первичные документы, их оформление, хранение, электронный документооборот"
  },
  {
    title: "Модуль 3. Учет основных средств",
    description: "Поступление, амортизация, переоценка, выбытие ОС. Практические кейсы"
  },
  {
    title: "Модуль 4. Учет нематериальных активов",
    description: "НМА: признание, оценка, амортизация, особенности учета"
  },
  {
    title: "Модуль 5. Учет запасов",
    description: "МПЗ, товары, готовая продукция. Методы оценки при списании"
  },
  {
    title: "Модуль 6. Учет денежных средств",
    description: "Касса, расчетный счет, валютные операции, инвентаризация"
  },
  {
    title: "Модуль 7. Расчеты с поставщиками",
    description: "Учет расчетов, акты сверки, авансы, претензии"
  },
  {
    title: "Модуль 8. Расчеты с покупателями",
    description: "Дебиторская задолженность, резервы, списание безнадежных долгов"
  },
  {
    title: "Модуль 9. Расчеты с персоналом",
    description: "Зарплата, отпускные, больничные, командировки, подотчет"
  },
  {
    title: "Модуль 10. Налог на прибыль",
    description: "Расчет налога, постоянные и временные разницы, отложенные налоги"
  },
  {
    title: "Модуль 11. НДС",
    description: "Исчисление, вычеты, книга покупок и продаж, декларирование"
  },
  {
    title: "Модуль 12. Налоги с ФОТ",
    description: "Подоходный налог, ФСЗН, страховые взносы"
  },
  {
    title: "Модуль 13. Прочие налоги",
    description: "Налог на недвижимость, земельный налог, экологический налог"
  },
  {
    title: "Модуль 14. Учет капитала",
    description: "Уставный фонд, резервы, нераспределенная прибыль"
  },
  {
    title: "Модуль 15. Учет кредитов и займов",
    description: "Получение, проценты, погашение, отражение в отчетности"
  },
  {
    title: "Модуль 16. Учет финансовых вложений",
    description: "Акции, облигации, депозиты, оценка и переоценка"
  },
  {
    title: "Модуль 17. Доходы и расходы",
    description: "Классификация, признание, особенности учета"
  },
  {
    title: "Модуль 18. Себестоимость",
    description: "Калькулирование, распределение затрат, методы учета"
  },
  {
    title: "Модуль 19. Финансовый результат",
    description: "Формирование прибыли/убытка, реформация баланса"
  },
  {
    title: "Модуль 20. Бухгалтерский баланс",
    description: "Структура, формирование, анализ показателей"
  },
  {
    title: "Модуль 21. Отчет о прибылях и убытках",
    description: "Составление, взаимоувязка с балансом"
  },
  {
    title: "Модуль 22. Прочие формы отчетности",
    description: "Отчет о движении денежных средств, изменениях капитала"
  },
  {
    title: "Модуль 23. Подготовка к проверке",
    description: "Чек-листы, типичные ошибки, самопроверка"
  },
  {
    title: "Модуль 24. Взаимодействие с проверяющими",
    description: "Права и обязанности, оформление результатов, обжалование"
  },
  {
    title: "Модуль 25. Итоговая аттестация",
    description: "Тестирование, практическое задание, получение сертификата"
  }
];

export function CourseProgram() {
  return (
    <section id="program" className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Программа курса</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              25 модулей с теорией, практикой и разбором реальных кейсов
            </p>
          </div>
        </AnimatedSection>

        <div className="max-w-3xl mx-auto">
          <AnimatedSection delay={100}>
            <Accordion type="single" collapsible className="space-y-3">
              {modules.map((module, index) => (
                <AccordionItem 
                  key={index} 
                  value={`module-${index}`}
                  className="bg-card border border-border rounded-lg px-4 data-[state=open]:border-primary/50"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{module.title}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 pl-11 text-muted-foreground">
                    {module.description}
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
