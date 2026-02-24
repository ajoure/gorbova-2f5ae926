import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Video,
  FolderOpen,
  Layers,
  Plus,
  Loader2,
  Check,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import { generateSlug } from "./ModuleFormFields";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────
interface FlatModule {
  id: string;
  title: string;
  slug: string;
  is_active: boolean;
  is_container: boolean;
  parent_module_id: string | null;
  sort_order: number | null;
}

export interface ModuleTreeNode extends FlatModule {
  children: ModuleTreeNode[];
  depth: number;
}

export interface ModuleTreeSelectorProps {
  sectionKey: string;
  /** null = "корень раздела" выбран, string = id выбранного модуля */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** select-parent: выбираем куда положить новый модуль
   *  select-module: выбираем куда положить урок */
  mode: "select-parent" | "select-module";
  /** Guard: исключить этот id из списка (при редактировании) */
  excludeId?: string;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
function buildTree(nodes: FlatModule[]): ModuleTreeNode[] {
  const allIds = new Set(nodes.map((n) => n.id));

  const buildChildren = (parentId: string, depth: number): ModuleTreeNode[] =>
    nodes
      .filter((n) => n.parent_module_id === parentId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((n) => ({
        ...n,
        depth,
        children: buildChildren(n.id, depth + 1),
      }));

  // Root = parent is null OR parent is outside the fetched set (orphan-aware)
  return nodes
    .filter((n) => !n.parent_module_id || !allIds.has(n.parent_module_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((n) => ({
      ...n,
      depth: 0,
      children: buildChildren(n.id, 1),
    }));
}

const checkSlugExists = async (slug: string): Promise<boolean> => {
  const { data } = await supabase
    .from("training_modules")
    .select("id")
    .eq("slug", slug)
    .limit(1);
  return !!(data && data.length > 0);
};

const ensureUniqueSlug = async (base: string): Promise<string> => {
  let slug = base;
  let suffix = 2;
  while (await checkSlugExists(slug)) {
    slug = `${base}-${suffix}`;
    suffix++;
  }
  return slug;
};

// ────────────────────────────────────────────────────────────────
// Sub-component: single tree node row
// ────────────────────────────────────────────────────────────────
function TreeNodeRow({
  node,
  selectedId,
  onSelect,
  excludeId,
  onQuickCreate,
  mode,
}: {
  node: ModuleTreeNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  excludeId?: string;
  onQuickCreate: (parentId: string) => void;
  mode: "select-parent" | "select-module";
}) {
  const isExcluded = node.id === excludeId;
  const isSelected = selectedId === node.id;
  const isContainer = node.is_container;
  const MAX_DEPTH = 3;

  return (
    <div>
      <div
        style={{ paddingLeft: `${node.depth * 20}px` }}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2.5 transition-all cursor-pointer",
          isSelected
            ? "bg-primary/10 ring-1 ring-primary/40"
            : "hover:bg-muted/60",
          isExcluded && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
        onClick={() => !isExcluded && onSelect(node.id)}
      >
        {/* Indent connector */}
        {node.depth > 0 && (
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        )}

        {/* Icon */}
        <div
          className={cn(
            "p-1.5 rounded-md shrink-0",
            isSelected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isContainer ? (
            <Layers className="h-4 w-4" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
        </div>

        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{node.title}</span>
            {!node.is_active && (
              <Badge variant="secondary" className="gap-1 text-xs py-0">
                <EyeOff className="h-3 w-3" />
                Скрыт
              </Badge>
            )}
            {isContainer && (
              <Badge variant="outline" className="text-xs py-0">
                Папка
              </Badge>
            )}
          </div>
        </div>

        {/* Selected check */}
        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}

        {/* Quick-create child button (only in select-parent mode, within depth limit) */}
        {mode === "select-parent" && node.depth < MAX_DEPTH - 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
            title="Создать дочерний модуль здесь"
            onClick={(e) => {
              e.stopPropagation();
              onQuickCreate(node.id);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Recursively render children */}
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
          excludeId={excludeId}
          onQuickCreate={onQuickCreate}
          mode={mode}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────
export function ModuleTreeSelector({
  sectionKey,
  selectedId,
  onSelect,
  mode,
  excludeId,
}: ModuleTreeSelectorProps) {
  const [quickCreateParentId, setQuickCreateParentId] = useState<
    string | null | undefined
  >(undefined); // undefined = hidden, null = root, string = parentId
  const [quickTitle, setQuickTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Guard: не загружаем без секции
  const {
    data: flatModules,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["module-tree", sectionKey],
    queryFn: async () => {
      if (!sectionKey) return [];
      const { data, error } = await supabase
        .from("training_modules")
        .select(
          "id,title,slug,is_active,is_container,parent_module_id,sort_order"
        )
        .eq("menu_section_key", sectionKey)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as FlatModule[];
    },
    enabled: !!sectionKey,
  });

  const tree = buildTree(flatModules ?? []);

  // ── Quick-create handler ──────────────────────────────────────
  const handleQuickCreate = async (parentId: string | null) => {
    if (!quickTitle.trim()) {
      toast.error("Введите название модуля");
      return;
    }
    // Guard: sectionKey is required
    if (!sectionKey) {
      toast.error("Раздел не выбран");
      return;
    }

    setIsCreating(true);
    try {
      const baseSlug = generateSlug(quickTitle);
      const slug = await ensureUniqueSlug(baseSlug);

      const { data, error } = await supabase
        .from("training_modules")
        .insert({
          title: quickTitle.trim(),
          slug,
          menu_section_key: sectionKey,
          parent_module_id: parentId,
          is_container: false,
          is_active: true,
        })
        .select("id")
        .single();

      if (error) throw error;

      toast.success("Модуль создан");
      setQuickTitle("");
      setQuickCreateParentId(undefined);
      await refetch();
      // Авто-выбор нового модуля
      onSelect(data.id);
    } catch (err: any) {
      console.error("Quick-create module error:", err);
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  if (!sectionKey) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Сначала выберите раздел меню
      </div>
    );
  }

  const labelText =
    mode === "select-parent"
      ? "Выберите, где создать новый модуль"
      : "Выберите, в какой модуль добавить урок";

  return (
    <div className="space-y-4">
      <Label className="text-base font-medium">{labelText}</Label>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1">
          {/* "Корень раздела" option */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all",
              selectedId === null
                ? "bg-primary/10 ring-1 ring-primary/40"
                : "hover:bg-muted/60"
            )}
            onClick={() => onSelect(null)}
          >
            <div
              className={cn(
                "p-1.5 rounded-md shrink-0",
                selectedId === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Video className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">
                {mode === "select-parent"
                  ? "В корень раздела (без родителя)"
                  : "Отдельный урок (без модуля)"}
              </span>
              <p className="text-xs text-muted-foreground">
                {mode === "select-parent"
                  ? "Модуль будет на верхнем уровне раздела"
                  : "Урок отобразится напрямую в разделе"}
              </p>
            </div>
            {selectedId === null && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
            {/* Quick-create at root */}
            {mode === "select-parent" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                title="Создать модуль в корне раздела"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickCreateParentId(null);
                  setQuickTitle("");
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Tree nodes */}
          {tree.length > 0 ? (
            <>
              <div className="text-xs text-muted-foreground px-3 pt-2 pb-1">
                {mode === "select-parent"
                  ? "Или выберите существующий модуль как родителя:"
                  : "Или выберите существующий модуль:"}
              </div>
              {tree.map((node) => (
                <TreeNodeRow
                  key={node.id}
                  node={node}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  excludeId={excludeId}
                  onQuickCreate={(parentId) => {
                    setQuickCreateParentId(parentId);
                    setQuickTitle("");
                  }}
                  mode={mode}
                />
              ))}
            </>
          ) : (
            <div className="text-sm text-muted-foreground px-3 py-2">
              В этом разделе пока нет модулей
            </div>
          )}

          {/* Quick-create form (shown when a + button was clicked) */}
          {quickCreateParentId !== undefined && (
            <GlassCard className="p-4 space-y-3 mt-2">
              <Label className="text-sm">
                {quickCreateParentId === null
                  ? "Новый модуль в корне раздела"
                  : `Новый модуль внутри: ${
                      flatModules?.find((m) => m.id === quickCreateParentId)
                        ?.title ?? "..."
                    }`}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Название модуля"
                  disabled={isCreating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickCreate(quickCreateParentId);
                    }
                  }}
                  autoFocus
                />
                <Button
                  onClick={() => handleQuickCreate(quickCreateParentId)}
                  disabled={!quickTitle.trim() || isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuickCreateParentId(undefined);
                    setQuickTitle("");
                  }}
                  disabled={isCreating}
                >
                  Отмена
                </Button>
              </div>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
}
