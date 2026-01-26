import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, CheckSquare } from "lucide-react";
import { DateFilter, PeriodSelector } from "@/components/ui/period-selector";
import { useBepaidStatement, useBepaidStatementStats } from "@/hooks/useBepaidStatement";
import { BepaidStatementSummary } from "./BepaidStatementSummary";
import { BepaidStatementTable } from "./BepaidStatementTable";
import { BepaidStatementImportDialog } from "./BepaidStatementImportDialog";
import { format, startOfMonth, endOfMonth } from "date-fns";

export function BepaidStatementTabContent() {
  // Default to current month
  const now = new Date();
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const { data: rows = [], isLoading } = useBepaidStatement(dateFilter, searchQuery);
  const { data: stats, isLoading: statsLoading } = useBepaidStatementStats(dateFilter);

  // Calculate selected rows sum
  const selectedStats = useMemo(() => {
    if (selectedIds.size === 0) return null;
    
    const selectedRows = rows.filter(row => selectedIds.has(row.id));
    const sum = selectedRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    return {
      count: selectedRows.length,
      sum,
    };
  }, [rows, selectedIds]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ru-BY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Button onClick={() => setImportDialogOpen(true)} size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Импорт
          </Button>
          <PeriodSelector value={dateFilter} onChange={setDateFilter} />
        </div>
        
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по всем полям..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary stats */}
      <BepaidStatementSummary stats={stats} isLoading={statsLoading} />

      {/* Selection summary */}
      {selectedStats && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            Выделено: {selectedStats.count} транзакций
          </span>
          <span className="text-sm text-muted-foreground">|</span>
          <span className="text-sm font-bold text-primary">
            Сумма: {formatAmount(selectedStats.sum)} BYN
          </span>
        </div>
      )}

      {/* Table */}
      <BepaidStatementTable
        data={rows}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {/* Row count */}
      <div className="text-xs text-muted-foreground text-right">
        Показано: {rows.length} строк
      </div>

      {/* Import dialog */}
      <BepaidStatementImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
}
