import { Link } from "react-router-dom";
import logoImage from "@/assets/logo.png";

export function LandingFooter() {
  return (
    <footer className="py-12 border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="Буква Закона" className="h-8 w-auto" />
            <div>
              <span className="font-bold text-foreground">БУКВА ЗАКОНА</span>
              <span className="block text-xs text-muted-foreground">Клуб по законодательству</span>
            </div>
          </div>

          <nav className="flex items-center gap-6 text-sm">
            <a href="#benefits" className="text-muted-foreground hover:text-foreground transition-colors">
              Преимущества
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Тарифы
            </a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">
              Вход
            </Link>
          </nav>

          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Катерина Горбова. Все права защищены.
          </p>
        </div>
      </div>
    </footer>
  );
}
