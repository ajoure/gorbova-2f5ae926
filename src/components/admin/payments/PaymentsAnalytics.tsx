import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, DollarSign, RotateCcw, Ban, Percent, Wallet } from "lucide-react";
import { UnifiedPayment } from "@/hooks/useUnifiedPayments";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type AnalyticsFilter = 'successful' | 'refunded' | 'failed' | 'fees' | 'net' | null;

// Constants for status classification
export const FAILED_STATUSES = ['failed', 'canceled', 'expired', 'declined', 'error'];
export const SUCCESSFUL_STATUSES = ['successful', 'succeeded'];

interface PaymentsAnalyticsProps {
  payments: UnifiedPayment[];
  isLoading: boolean;
  activeFilter?: AnalyticsFilter;
  onFilterChange?: (filter: AnalyticsFilter) => void;
}

interface AnalyticCardProps {
  title: string;
  amount: number;
  currency: string;
  icon: React.ReactNode;
  colorClass: string;
  bgColorClass: string;
  isClickable?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  tooltip?: string;
  subtitle?: string;
}

function AnalyticCard({ 
  title, 
  amount, 
  currency, 
  icon, 
  colorClass, 
  bgColorClass,
  isClickable = false,
  isActive = false,
  onClick,
  tooltip,
  subtitle,
}: AnalyticCardProps) {
  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const content = (
    <div 
      className={cn(
        "relative overflow-hidden rounded-xl p-4 min-h-[88px]",
        "backdrop-blur-xl border border-border/50",
        bgColorClass,
        isClickable && "cursor-pointer transition-all hover:scale-[1.02] hover:border-primary/50 hover:shadow-md",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      onClick={isClickable ? onClick : undefined}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0",
          "bg-background/80",
          colorClass
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5 truncate">{title}</p>
          <div className="flex items-baseline gap-1.5">
            <span className={cn("text-xl font-bold tabular-nums", colorClass)}>
              {formatAmount(amount)}
            </span>
            <span className="text-sm text-muted-foreground">{currency}</span>
          </div>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export default function PaymentsAnalytics({ 
  payments, 
  isLoading,
  activeFilter,
  onFilterChange,
}: PaymentsAnalyticsProps) {
  const analytics = useMemo(() => {
    if (!payments.length) {
      return {
        successful: { BYN: 0, USD: 0, EUR: 0, RUB: 0 },
        refunded: { BYN: 0, USD: 0, EUR: 0, RUB: 0 },
        failed: { BYN: 0, USD: 0, EUR: 0, RUB: 0 },
        fees: { BYN: 0, USD: 0, EUR: 0, RUB: 0 },
        feesUnknown: 0,
        feesKnown: 0,
        primaryCurrency: 'BYN',
      };
    }

    const result = {
      successful: { BYN: 0, USD: 0, EUR: 0, RUB: 0 } as Record<string, number>,
      refunded: { BYN: 0, USD: 0, EUR: 0, RUB: 0 } as Record<string, number>,
      failed: { BYN: 0, USD: 0, EUR: 0, RUB: 0 } as Record<string, number>,
      fees: { BYN: 0, USD: 0, EUR: 0, RUB: 0 } as Record<string, number>,
      feesUnknown: 0,
      feesKnown: 0,
    };

    const currencyCount: Record<string, number> = {};
    
    // Track UIDs from payments_v2 that have refunded_amount to avoid double-counting
    const processedRefundUids = new Set<string>();

    payments.forEach(p => {
      const currency = p.currency || 'BYN';
      currencyCount[currency] = (currencyCount[currency] || 0) + 1;

      const statusNormalized = (p.status_normalized || '').toLowerCase();
      
      // Successful payments (Gross)
      if (SUCCESSFUL_STATUSES.includes(statusNormalized)) {
        result.successful[currency] = (result.successful[currency] || 0) + p.amount;
        
        // Fees extraction - multiple fallback paths
        let feeAmount: number | null = null;
        const providerResponse = p.provider_response;
        
        if (providerResponse) {
          // Try multiple paths for fee
          const fee = providerResponse.transaction?.fee 
            ?? providerResponse.transaction?.processing?.fee
            ?? providerResponse.transaction?.payment?.fee
            ?? providerResponse.fee
            ?? null;
          
          if (fee !== null && fee !== undefined) {
            // bePaid returns fee in cents
            feeAmount = Number(fee) / 100;
          }
        }
        
        // Also check unified payment fee fields (if added)
        if (feeAmount === null && (p as any).provider_fee_amount != null) {
          feeAmount = (p as any).provider_fee_amount;
        }
        
        if (feeAmount !== null && !isNaN(feeAmount) && feeAmount > 0) {
          result.fees[currency] = (result.fees[currency] || 0) + feeAmount;
          result.feesKnown++;
        } else {
          result.feesUnknown++;
        }
      }
      
      // Failed payments
      if (FAILED_STATUSES.includes(statusNormalized)) {
        result.failed[currency] = (result.failed[currency] || 0) + p.amount;
      }

      // Refunds - with dedup logic
      // Priority 1: payments_v2.total_refunded (refunded_amount)
      if (p.rawSource === 'payments_v2' && p.total_refunded > 0) {
        result.refunded[currency] = (result.refunded[currency] || 0) + p.total_refunded;
        // Mark this UID as having refund accounted for
        if (p.uid) {
          processedRefundUids.add(p.uid);
        }
      }
      
      // Priority 2: Separate refund transactions from queue
      // Only count if NOT already accounted for in payments_v2
      if (p.rawSource === 'queue') {
        const isRefundTx = p.transaction_type === 'Возврат средств' 
          || p.transaction_type === 'refund'
          || statusNormalized === 'refunded';
        
        if (isRefundTx) {
          // Check if this refund's base payment already has total_refunded
          // We use the UID to check - if a payment with this UID exists in payments_v2 and has refunds, skip
          if (!p.uid || !processedRefundUids.has(p.uid)) {
            result.refunded[currency] = (result.refunded[currency] || 0) + p.amount;
          }
        }
      }
    });

    // Determine primary currency (most common)
    const primaryCurrency = Object.entries(currencyCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'BYN';

    return { ...result, primaryCurrency };
  }, [payments]);

  const handleFilterClick = (filter: AnalyticsFilter) => {
    if (onFilterChange) {
      // Toggle off if already active
      onFilterChange(activeFilter === filter ? null : filter);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-[88px] rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const { primaryCurrency } = analytics;
  const successfulAmount = analytics.successful[primaryCurrency] || 0;
  const refundedAmount = analytics.refunded[primaryCurrency] || 0;
  const failedAmount = analytics.failed[primaryCurrency] || 0;
  const feesAmount = analytics.fees[primaryCurrency] || 0;
  const netRevenue = successfulAmount - refundedAmount - feesAmount;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        Финансовая сводка за период
        {activeFilter && (
          <span className="text-xs text-primary">• Активен фильтр (клик для сброса)</span>
        )}
      </h3>
      
      <div className="grid gap-3 grid-cols-1 md:grid-cols-5">
        <AnalyticCard
          title="Успешные платежи"
          amount={successfulAmount}
          currency={primaryCurrency}
          icon={<TrendingUp className="h-5 w-5" />}
          colorClass="text-green-600 dark:text-green-400"
          bgColorClass="bg-green-500/5 dark:bg-green-500/10"
          isClickable={!!onFilterChange}
          isActive={activeFilter === 'successful'}
          onClick={() => handleFilterClick('successful')}
          tooltip="Клик для фильтрации по успешным платежам"
        />
        
        <AnalyticCard
          title="Возвраты"
          amount={refundedAmount}
          currency={primaryCurrency}
          icon={<RotateCcw className="h-5 w-5" />}
          colorClass="text-amber-600 dark:text-amber-400"
          bgColorClass="bg-amber-500/5 dark:bg-amber-500/10"
          isClickable={!!onFilterChange}
          isActive={activeFilter === 'refunded'}
          onClick={() => handleFilterClick('refunded')}
          tooltip="Клик для фильтрации по возвратам"
        />
        
        <AnalyticCard
          title="Ошибочные"
          amount={failedAmount}
          currency={primaryCurrency}
          icon={<Ban className="h-5 w-5" />}
          colorClass="text-red-600 dark:text-red-400"
          bgColorClass="bg-red-500/5 dark:bg-red-500/10"
          isClickable={!!onFilterChange}
          isActive={activeFilter === 'failed'}
          onClick={() => handleFilterClick('failed')}
          tooltip="Клик для фильтрации по ошибочным платежам"
        />

        <AnalyticCard
          title="Комиссии"
          amount={feesAmount}
          currency={primaryCurrency}
          icon={<Percent className="h-5 w-5" />}
          colorClass="text-purple-600 dark:text-purple-400"
          bgColorClass="bg-purple-500/5 dark:bg-purple-500/10"
          isClickable={!!onFilterChange}
          isActive={activeFilter === 'fees'}
          onClick={() => handleFilterClick('fees')}
          tooltip={analytics.feesUnknown > 0 
            ? `Комиссия известна для ${analytics.feesKnown} платежей` 
            : "Клик для фильтрации по платежам с известной комиссией"}
          subtitle={analytics.feesUnknown > 0 ? `Неизвестно: ${analytics.feesUnknown}` : undefined}
        />

        <AnalyticCard
          title="Чистая выручка"
          amount={netRevenue}
          currency={primaryCurrency}
          icon={<Wallet className="h-5 w-5" />}
          colorClass={netRevenue >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}
          bgColorClass="bg-blue-500/5 dark:bg-blue-500/10"
          isClickable={!!onFilterChange}
          isActive={activeFilter === 'net'}
          onClick={() => handleFilterClick('net')}
          tooltip="Gross − Возвраты − Комиссии"
        />
      </div>
      
      {/* Show other currencies if present */}
      {Object.keys(analytics.successful).filter(c => c !== primaryCurrency && analytics.successful[c] > 0).length > 0 && (
        <div className="text-xs text-muted-foreground mt-2">
          {Object.entries(analytics.successful)
            .filter(([c, v]) => c !== primaryCurrency && v > 0)
            .map(([currency, amount]) => (
              <span key={currency} className="mr-3">
                +{amount.toFixed(2)} {currency}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
