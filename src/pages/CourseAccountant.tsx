import { useState } from "react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { CourseHero } from "@/components/course/CourseHero";
import { CourseAudience } from "@/components/course/CourseAudience";
import { CourseExpert } from "@/components/course/CourseExpert";
import { CourseProgram } from "@/components/course/CourseProgram";
import { CourseResults } from "@/components/course/CourseResults";
import { CoursePricing } from "@/components/course/CoursePricing";
import { PreregistrationDialog } from "@/components/course/PreregistrationDialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CourseTariff {
  name: string;
  price: number;
  originalPrice?: number;
  description: string;
  features: string[];
  isPopular?: boolean;
}

export default function CourseAccountant() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [preregOpen, setPreregOpen] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState<CourseTariff | null>(null);

  const handlePreregister = (tariff: CourseTariff) => {
    setSelectedTariff(tariff);
    setPreregOpen(true);
  };

  const handlePurchase = (tariff: CourseTariff) => {
    if (!user) {
      navigate("/auth", { state: { returnTo: "/course-accountant" } });
      return;
    }
    // TODO: После создания продукта в БД, использовать PaymentDialog с правильным productId
    toast.info("Оплата будет доступна после настройки тарифов в админ-панели");
  };

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      
      <main>
        <CourseHero />
        <CourseAudience />
        <CourseExpert />
        <CourseProgram />
        <CourseResults />
        <CoursePricing 
          onPreregister={handlePreregister}
          onPurchase={handlePurchase}
        />
      </main>

      <LandingFooter />

      <PreregistrationDialog
        open={preregOpen}
        onOpenChange={setPreregOpen}
        tariffName={selectedTariff?.name}
      />
    </div>
  );
}
