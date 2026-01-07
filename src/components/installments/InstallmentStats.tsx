import { Card, CardContent } from "@/components/ui/card";
import { 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  Check,
  XCircle,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstallmentWithDetails } from "@/hooks/useInstallments";
import { isPast } from "date-fns";

interface InstallmentStatsProps {
  installments: InstallmentWithDetails[];
  currency?: string;
}

export function InstallmentStats({ installments, currency = "BYN" }: InstallmentStatsProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const pending = installments.filter(i => i.status === "pending");
  const overdue = pending.filter(i => isPast(new Date(i.due_date)));
  const succeeded = installments.filter(i => i.status === "succeeded");
  const cancelled = installments.filter(i => i.status === "cancelled");
  const forgiven = installments.filter(i => i.status === "forgiven");

  const pendingAmount = pending.reduce((sum, i) => sum + Number(i.amount), 0);
  const overdueAmount = overdue.reduce((sum, i) => sum + Number(i.amount), 0);
  const succeededAmount = succeeded.reduce((sum, i) => sum + Number(i.amount), 0);
  const cancelledAmount = cancelled.reduce((sum, i) => sum + Number(i.amount), 0);
  const forgivenAmount = forgiven.reduce((sum, i) => sum + Number(i.amount), 0);

  const stats = [
    {
      label: "Ожидают оплаты",
      value: pending.length,
      amount: pendingAmount,
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
    },
    {
      label: "Просрочено",
      value: overdue.length,
      amount: overdueAmount,
      icon: AlertTriangle,
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      highlight: overdue.length > 0,
    },
    {
      label: "Успешно оплачено",
      value: succeeded.length,
      amount: succeededAmount,
      icon: Check,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
    },
    {
      label: "Ожидаемые поступления",
      value: null,
      amount: pendingAmount,
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
      borderColor: "border-primary/20",
    },
    {
      label: "Не оплачено",
      value: cancelled.length,
      amount: cancelledAmount,
      icon: XCircle,
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      borderColor: "border-muted",
      hide: cancelled.length === 0,
    },
    {
      label: "Прощено",
      value: forgiven.length,
      amount: forgivenAmount,
      icon: Gift,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      hide: forgiven.length === 0,
    },
  ];

  const visibleStats = stats.filter(s => !s.hide);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {visibleStats.map((stat, index) => (
        <Card 
          key={index} 
          className={cn(
            "transition-all",
            stat.highlight && "border-destructive/50 bg-destructive/5"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                stat.bgColor
              )}>
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
              {stat.value !== null && (
                <span className={cn(
                  "text-2xl font-bold",
                  stat.highlight && "text-destructive"
                )}>
                  {stat.value}
                </span>
              )}
            </div>
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn("text-lg font-semibold", stat.color)}>
                {formatAmount(stat.amount)} {currency}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}