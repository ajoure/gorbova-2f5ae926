import { Link } from "react-router-dom";
import logoImage from "@/assets/logo.png";
import paymentSystemsImage from "@/assets/payment-systems.png";

export function CourseFooter() {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="bg-card/50 border-t border-border/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Logo & Description */}
          <div className="md:col-span-2">
            <a 
              href="https://club.gorbova.by" 
              className="flex items-center gap-3 mb-4 hover:opacity-80 transition-opacity"
            >
              <img src={logoImage} alt="Буква Закона" className="h-10 w-auto" />
              <div>
                <span className="text-lg font-bold text-foreground">БУКВА ЗАКОНА</span>
                <span className="block text-xs text-muted-foreground">Клуб по законодательству</span>
              </div>
            </a>
            <p className="text-muted-foreground text-sm max-w-md mb-4">
              Курс «Ценный бухгалтер» — практическое обучение методологии бухгалтерского учета 
              от эксперта с 12-летним опытом.
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>ИП Горбова Мария Александровна</p>
              <p>УНП 193547804</p>
              <p>г. Минск</p>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Курс</h4>
            <nav className="space-y-2 text-sm">
              <button 
                onClick={() => scrollToSection("audience")}
                className="block text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Для кого
              </button>
              <button 
                onClick={() => scrollToSection("program")}
                className="block text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Программа
              </button>
              <button 
                onClick={() => scrollToSection("expert")}
                className="block text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Эксперт
              </button>
              <button 
                onClick={() => scrollToSection("pricing")}
                className="block text-muted-foreground hover:text-foreground transition-colors text-left"
              >
                Тарифы
              </button>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4 text-foreground">Документы</h4>
            <nav className="space-y-2 text-sm">
              <Link 
                to="/privacy" 
                className="block text-muted-foreground hover:text-foreground transition-colors"
              >
                Политика конфиденциальности
              </Link>
              <a 
                href="https://club.gorbova.by/contacts" 
                className="block text-muted-foreground hover:text-foreground transition-colors"
              >
                Контакты
              </a>
            </nav>
          </div>
        </div>

        {/* Payment Systems */}
        <div className="border-t border-border/50 pt-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">Мы принимаем к оплате:</p>
            <img 
              src={paymentSystemsImage} 
              alt="Visa, Mastercard, Белкарт, ЕРИП" 
              className="h-8 w-auto opacity-70"
            />
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center text-xs text-muted-foreground">
          <p>© {currentYear} ИП Горбова М.А. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
