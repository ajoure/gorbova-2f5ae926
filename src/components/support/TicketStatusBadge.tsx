import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TicketStatusBadgeProps {
  status: "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
  className?: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  open: {
    label: "Открыт",
    variant: "destructive",
    className: "",
  },
  in_progress: {
    label: "В работе",
    variant: "default",
    className: "bg-yellow-500 hover:bg-yellow-600",
  },
  waiting_user: {
    label: "Ожидает ответа",
    variant: "default",
    className: "bg-blue-500 hover:bg-blue-600",
  },
  resolved: {
    label: "Решён",
    variant: "default",
    className: "bg-green-500 hover:bg-green-600",
  },
  closed: {
    label: "Закрыт",
    variant: "secondary",
    className: "",
  },
};

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.open;

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
