import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TicketPriorityBadgeProps {
  priority: "low" | "normal" | "high" | "urgent";
  className?: string;
}

const priorityConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  low: {
    label: "Низкий",
    variant: "outline",
    className: "text-muted-foreground",
  },
  normal: {
    label: "Обычный",
    variant: "secondary",
    className: "",
  },
  high: {
    label: "Высокий",
    variant: "default",
    className: "bg-orange-500 hover:bg-orange-600",
  },
  urgent: {
    label: "Срочный",
    variant: "destructive",
    className: "",
  },
};

export function TicketPriorityBadge({ priority, className }: TicketPriorityBadgeProps) {
  const config = priorityConfig[priority] || priorityConfig.normal;

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
