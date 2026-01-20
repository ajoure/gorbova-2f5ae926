import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Link2, Loader2, CheckCircle, AlertCircle, Play, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface CardLink {
  profile_id: string;
  card_last4: string;
  card_brand: string | null;
}

interface AutolinkResult {
  card: CardLink;
  result: {
    ok: boolean;
    status: string;
    stats?: {
      candidates_payments: number;
      candidates_queue: number;
      updated_payments_profile: number;
      updated_queue_profile: number;
      skipped_already_linked: number;
      conflicts: number;
    };
    stop_reason?: string;
    force_linked?: boolean;
  } | null;
  error?: string;
}

export default function AutolinkAllCardsButton() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDryRun, setIsDryRun] = useState(true);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AutolinkResult[]>([]);
  const [totalCards, setTotalCards] = useState(0);

  const handleRun = async (dryRun: boolean) => {
    setIsLoading(true);
    setIsDryRun(dryRun);
    setProgress(0);
    setResults([]);

    try {
      // Fetch all card-profile links
      const { data: cards, error: cardsError } = await supabase
        .from('card_profile_links')
        .select('profile_id, card_last4, card_brand');

      if (cardsError) throw cardsError;
      if (!cards || cards.length === 0) {
        toast.info('Нет привязанных карт в системе');
        setIsLoading(false);
        return;
      }

      setTotalCards(cards.length);
      const runResults: AutolinkResult[] = [];

      // Process each card
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        setProgress(((i + 1) / cards.length) * 100);

        try {
          const { data, error } = await supabase.functions.invoke('payments-autolink-by-card', {
            body: {
              profile_id: card.profile_id,
              card_last4: card.card_last4,
              card_brand: card.card_brand || 'unknown',
              dry_run: dryRun,
              limit: 200,
            }
          });

          runResults.push({
            card,
            result: data,
            error: error?.message,
          });
        } catch (e: any) {
          runResults.push({
            card,
            result: null,
            error: e.message || 'Unknown error',
          });
        }
      }

      setResults(runResults);

      // Calculate totals
      const totalUpdated = runResults.reduce((sum, r) => {
        if (r.result?.ok && r.result.stats) {
          return sum + (r.result.stats.updated_payments_profile || 0) + (r.result.stats.updated_queue_profile || 0);
        }
        return sum;
      }, 0);

      const totalCandidates = runResults.reduce((sum, r) => {
        if (r.result?.ok && r.result.stats) {
          return sum + (r.result.stats.candidates_payments || 0) + (r.result.stats.candidates_queue || 0);
        }
        return sum;
      }, 0);

      const stoppedCards = runResults.filter(r => r.result?.status === 'stop').length;
      const errorCards = runResults.filter(r => r.error || r.result?.status === 'error').length;

      if (dryRun) {
        toast.info(`Проверено ${cards.length} карт: ${totalCandidates} кандидатов для привязки`);
      } else {
        toast.success(`Привязано ${totalUpdated} платежей по ${cards.length} картам`);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['unified-payments'] });
        queryClient.invalidateQueries({ queryKey: ['contact-payments'] });
      }

      if (stoppedCards > 0) {
        toast.warning(`${stoppedCards} карт с коллизиями (требуют внимания)`);
      }
      if (errorCards > 0) {
        toast.error(`${errorCards} карт с ошибками`);
      }

    } catch (e: any) {
      console.error('Autolink all error:', e);
      toast.error('Ошибка: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setDialogOpen(false);
      setResults([]);
      setProgress(0);
    }
  };

  // Summary stats
  const successCount = results.filter(r => r.result?.ok && r.result.status === 'success').length;
  const stoppedCount = results.filter(r => r.result?.status === 'stop').length;
  const errorCount = results.filter(r => r.error || r.result?.status === 'error').length;
  const totalLinked = results.reduce((sum, r) => {
    if (r.result?.ok && r.result.stats) {
      return sum + (r.result.stats.updated_payments_profile || 0) + (r.result.stats.updated_queue_profile || 0);
    }
    return sum;
  }, 0);
  const totalCandidates = results.reduce((sum, r) => {
    if (r.result?.ok && r.result.stats) {
      return sum + (r.result.stats.candidates_payments || 0) + (r.result.stats.candidates_queue || 0);
    }
    return sum;
  }, 0);

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setDialogOpen(true)}
        className="gap-2"
      >
        <Link2 className="h-4 w-4" />
        Массовая привязка
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Массовая автопривязка по картам</DialogTitle>
            <DialogDescription>
              Запускает привязку исторических платежей для ВСЕХ карт в card_profile_links.
              Сначала рекомендуется сделать проверку (Dry-run).
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{isDryRun ? 'Проверка...' : 'Привязка...'}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Results summary */}
          {results.length > 0 && (
            <div className="space-y-4 flex-1 overflow-hidden">
              {/* Stats cards */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-lg bg-muted/50 text-center">
                  <div className="text-2xl font-bold">{totalCards}</div>
                  <div className="text-xs text-muted-foreground">Карт</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10 text-center">
                  <div className="text-2xl font-bold text-green-600">{successCount}</div>
                  <div className="text-xs text-muted-foreground">Успешно</div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{stoppedCount}</div>
                  <div className="text-xs text-muted-foreground">Коллизии</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 text-center">
                  <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                  <div className="text-xs text-muted-foreground">Ошибки</div>
                </div>
              </div>

              {/* Key metric */}
              <div className="p-3 rounded-lg bg-primary/10 flex items-center justify-between">
                <span className="font-medium">
                  {isDryRun ? 'Кандидатов для привязки:' : 'Привязано платежей:'}
                </span>
                <Badge variant="default" className="text-lg px-3 py-1">
                  {isDryRun ? totalCandidates : totalLinked}
                </Badge>
              </div>

              {/* Details list */}
              <ScrollArea className="flex-1 max-h-[300px]">
                <div className="space-y-1">
                  {results.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {r.error || r.result?.status === 'error' ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : r.result?.status === 'stop' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm font-mono">
                          {r.card.card_brand?.toUpperCase() || 'CARD'} ****{r.card.card_last4}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.result?.stats && (
                          <span className="text-xs text-muted-foreground">
                            {isDryRun
                              ? `${(r.result.stats.candidates_payments || 0) + (r.result.stats.candidates_queue || 0)} канд.`
                              : `${(r.result.stats.updated_payments_profile || 0) + (r.result.stats.updated_queue_profile || 0)} прив.`
                            }
                          </span>
                        )}
                        {r.result?.stop_reason && (
                          <Badge variant="outline" className="text-xs">
                            {r.result.stop_reason === 'card_collision_last4_brand' ? 'Коллизия' : r.result.stop_reason}
                          </Badge>
                        )}
                        {r.error && (
                          <Badge variant="destructive" className="text-xs">Ошибка</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {!isLoading && results.length === 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleRun(true)}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Dry-run (проверка)
                </Button>
                <Button
                  onClick={() => handleRun(false)}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Выполнить
                </Button>
              </>
            )}

            {!isLoading && results.length > 0 && isDryRun && totalCandidates > 0 && (
              <Button
                onClick={() => handleRun(false)}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Применить ({totalCandidates} платежей)
              </Button>
            )}

            {isLoading && (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isDryRun ? 'Проверка...' : 'Привязка...'}
              </Button>
            )}

            <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
