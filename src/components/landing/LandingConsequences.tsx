import { TrendingDown, Frown, DollarSign, Battery, AlertCircle } from "lucide-react";

const consequences = [
  {
    icon: TrendingDown,
    text: "Останетесь оператором 1С без уважения и роста",
  },
  {
    icon: Frown,
    text: "Каждый отчётный период — стресс, бессонные ночи и слёзы",
  },
  {
    icon: AlertCircle,
    text: "Штрафы будут выписывать на вас, даже если виноваты не вы",
  },
  {
    icon: DollarSign,
    text: "Ежедневная рутина не даст расти и много зарабатывать",
  },
  {
    icon: Battery,
    text: "Ошибки и штрафы сожрут и нервы, и зарплату",
  },
];

export function LandingConsequences() {
  return (
    <section className="py-20 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-destructive/5 -z-10" />
      
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Что будет, если ничего не менять?
            </h2>
            <p className="text-lg text-muted-foreground">
              Чувствуете? Внутри копится злость и апатия...
            </p>
          </div>

          <div className="space-y-4">
            {consequences.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-xl border border-destructive/20 bg-card/80"
              >
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="text-destructive" size={20} />
                </div>
                <p className="text-foreground font-medium">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-xl text-foreground font-semibold">
              Но выход есть — стать <span className="text-primary">бухгалтером нового поколения</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
