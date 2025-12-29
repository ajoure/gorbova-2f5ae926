import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function LandingCTA() {
  const navigate = useNavigate();

  const handleTryFree = () => {
    console.log("[Analytics] click_cta_try_free");
    navigate("/auth?mode=signup");
  };

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div
          className="max-w-4xl mx-auto p-8 sm:p-12 rounded-3xl border border-primary/20 text-center"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.1))",
            backdropFilter: "blur(20px)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Готовы стать бухгалтером нового поколения?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Присоединяйтесь к сообществу профессионалов, которые уверенно защищают 
            бизнес и растут в доходе
          </p>
          <Button size="lg" onClick={handleTryFree} className="text-lg px-8 py-6">
            Попробовать бесплатно
            <ArrowRight className="ml-2" size={20} />
          </Button>
        </div>
      </div>
    </section>
  );
}
