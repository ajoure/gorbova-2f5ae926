import { CreditCard, RotateCcw, XCircle, Percent, Banknote } from "lucide-react";
import { BepaidStatementStats } from "@/hooks/useBepaidStatement";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

function StatCard({ title, value, subtitle, icon, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'from-slate-500/10 to-slate-600/5 border-slate-500/20',
    success: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20',
    warning: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
    danger: 'from-rose-500/10 to-rose-600/5 border-rose-500/20',
  };
  
  const iconStyles = {
    default: 'text-slate-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-rose-400',
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-gradient-to-br backdrop-blur-xl p-4",
      variantStyles[variant]
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn("p-2 rounded-lg bg-background/50", iconStyles[variant])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface BepaidStatementSummaryProps {
  stats: BepaidStatementStats | undefined;
  isLoading: boolean;
}

export function BepaidStatementSummary({ stats, isLoading }: BepaidStatementSummaryProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ru-BY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const data = stats || {
    payments_count: 0,
    payments_amount: 0,
    refunds_count: 0,
    refunds_amount: 0,
    cancellations_count: 0,
    cancellations_amount: 0,
    commission_total: 0,
    payout_total: 0,
    total_count: 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard
        title="Платежи"
        value={formatAmount(data.payments_amount)}
        subtitle={`${data.payments_count} шт`}
        icon={<CreditCard className="h-4 w-4" />}
        variant="success"
      />
      <StatCard
        title="Возвраты"
        value={formatAmount(data.refunds_amount)}
        subtitle={`${data.refunds_count} шт`}
        icon={<RotateCcw className="h-4 w-4" />}
        variant="warning"
      />
      <StatCard
        title="Отмены"
        value={formatAmount(data.cancellations_amount)}
        subtitle={`${data.cancellations_count} шт`}
        icon={<XCircle className="h-4 w-4" />}
        variant="danger"
      />
      <StatCard
        title="Комиссия"
        value={formatAmount(data.commission_total)}
        icon={<Percent className="h-4 w-4" />}
        variant="default"
      />
      <StatCard
        title="Перечислено"
        value={formatAmount(data.payout_total)}
        icon={<Banknote className="h-4 w-4" />}
        variant="success"
      />
    </div>
  );
}
