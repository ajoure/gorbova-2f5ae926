import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  Copy,
} from "lucide-react";
import { TrainingModule } from "@/hooks/useTrainingModules";

interface TrainingModuleCardProps {
  module: TrainingModule;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLessons: () => void;
  onCopyMove?: () => void;
}

export default function TrainingModuleCard({
  module,
  onEdit,
  onDelete,
  onOpenLessons,
  onCopyMove,
}: TrainingModuleCardProps) {
  const productBadges = module.accessible_products || [];
  const hasAccess = productBadges.length > 0;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl transition-all duration-300",
        "backdrop-blur-xl bg-card/60 dark:bg-card/40",
        "border border-border/50 hover:border-border",
        "shadow-sm hover:shadow-md",
      )}
    >
      {/* Color gradient bar */}
      <div className={cn("h-1 bg-gradient-to-r", module.color_gradient)} />

      <div className="relative p-3">
        {/* Header: title + badges row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm leading-tight line-clamp-2 flex-1 min-w-0">
            {module.title}
          </h3>
          <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
            <Badge
              variant={module.is_active ? "default" : "secondary"}
              className={cn(
                "text-[10px] px-1.5 py-0 gap-0.5",
                module.is_active && "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
              )}
            >
              {module.is_active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {module.is_active ? "Активен" : "Скрыт"}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 bg-background/50">
              <BookOpen className="h-3 w-3" />
              {module.lesson_count || 0}
            </Badge>
          </div>
        </div>

        {/* Description */}
        {module.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {module.description}
          </p>
        )}

        {/* Product badges - compact */}
        {hasAccess && (
          <div className="flex flex-wrap gap-1 mb-2">
            {productBadges.slice(0, 3).map((p, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-muted/30 border-border/30"
              >
                {p.product_name}
                {p.tariff_count > 1 && ` (${p.tariff_count})`}
              </Badge>
            ))}
            {productBadges.length > 3 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                +{productBadges.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenLessons}
            className="gap-1 text-primary hover:text-primary h-8 px-2 text-xs"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Уроки
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <div className="flex items-center gap-0.5">
            {onCopyMove && (
              <Button variant="ghost" size="icon" onClick={onCopyMove} title="Копировать / Переместить" className="h-8 w-8">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
