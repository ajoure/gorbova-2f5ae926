import Landing from "@/pages/Landing";
import Consultation from "@/pages/Consultation";

export function DomainHomePage() {
  const hostname = window.location.hostname;
  
  // consultation.gorbova.by → страница консультации
  if (hostname.includes('consultation.')) {
    return <Consultation />;
  }
  
  // club.gorbova.by или другие домены → главная страница
  return <Landing />;
}
