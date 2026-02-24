import { cn } from "@/lib/utils";
import { LayoutGrid, List } from "lucide-react";

const LAYOUT_OPTIONS = [
  { value: "grid" as const, icon: LayoutGrid, label: "Сетка" },
  { value: "list" as const, icon: List, label: "Список" },
];

export type DisplayLayout = "grid" | "list";

/** Normalize legacy values (cards-horizontal, fullscreen) → grid */
export function normalizeLayout(raw: string | null): DisplayLayout {
  if (raw === "list") return "list";
  return "grid";
}

interface DisplayLayoutSelectorProps {
  value: string;
  onChange: (value: DisplayLayout) => void;
  className?: string;
}

export function DisplayLayoutSelector({
  value,
  onChange,
  className,
}: DisplayLayoutSelectorProps) {
  const normalized = normalizeLayout(value);

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      {LAYOUT_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = normalized === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.label}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-all duration-200",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
