import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  HelpCircle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export interface CardHealthBadgeProps {
  verificationStatus: string | null;
  supportsRecurring: boolean | null;
  recurringVerified: boolean | null;
  verificationError: string | null;
  verificationCheckedAt: string | null;
}

type DiagnosisConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  Icon: React.ElementType;
  className?: string;
};

const DIAGNOSES: Record<string, DiagnosisConfig> = {
  verified: {
    label: "ОК для автосписаний",
    variant: "default",
    Icon: CheckCircle,
    className: "bg-green-500/10 text-green-700 border-green-500/30 hover:bg-green-500/20",
  },
  rejected: {
    label: "Требует 3DS / банк блокирует",
    variant: "destructive",
    Icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
  },
  failed: {
    label: "Ошибка проверки",
    variant: "secondary",
    Icon: AlertCircle,
    className: "bg-orange-500/10 text-orange-700 border-orange-500/30 hover:bg-orange-500/20",
  },
  pending: {
    label: "В очереди на проверку",
    variant: "outline",
    Icon: Loader2,
    className: "bg-blue-500/10 text-blue-700 border-blue-500/30 hover:bg-blue-500/20",
  },
  processing: {
    label: "Проверяется...",
    variant: "outline",
    Icon: Loader2,
    className: "bg-blue-500/10 text-blue-700 border-blue-500/30 hover:bg-blue-500/20",
  },
  rate_limited: {
    label: "Ожидание (rate limit)",
    variant: "outline",
    Icon: Clock,
    className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500/20",
  },
  unknown: {
    label: "Не проверена",
    variant: "secondary",
    Icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-muted-foreground/30",
  },
};

export function CardHealthBadge({
  verificationStatus,
  supportsRecurring,
  recurringVerified,
  verificationError,
  verificationCheckedAt,
}: CardHealthBadgeProps) {
  // Determine diagnosis
  const status = verificationStatus?.toLowerCase() || "unknown";
  const config = DIAGNOSES[status] || DIAGNOSES.unknown;
  const { label, Icon, className } = config;

  // Build tooltip content
  const tooltipLines: string[] = [];
  
  if (verificationCheckedAt) {
    tooltipLines.push(
      `Проверена: ${format(new Date(verificationCheckedAt), "dd.MM.yy HH:mm", { locale: ru })}`
    );
  }
  
  if (supportsRecurring !== null) {
    tooltipLines.push(`supports_recurring: ${supportsRecurring ? "да" : "нет"}`);
  }
  
  if (recurringVerified !== null) {
    tooltipLines.push(`recurring_verified: ${recurringVerified ? "да" : "нет"}`);
  }
  
  if (verificationError) {
    tooltipLines.push(`Ошибка: ${verificationError}`);
  }

  const hasTooltip = tooltipLines.length > 0;
  const isAnimated = status === "pending" || status === "processing";

  const badge = (
    <Badge
      variant="outline"
      className={`text-xs gap-1 cursor-default ${className}`}
    >
      <Icon className={`w-3 h-3 ${isAnimated ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );

  if (!hasTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <div className="space-y-0.5">
            {tooltipLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
