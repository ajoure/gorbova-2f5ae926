import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
  Pencil,
  Shield,
  CheckSquare,
  Square,
} from "lucide-react";

interface Permission {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

interface RolePermissionEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleName: string;
  roleCode: string;
  allPermissions: Permission[];
  selectedPermissions: string[];
  onSave: (permissionCodes: string[]) => Promise<void>;
  isLoading?: boolean;
}

const categoryLabels: Record<string, string> = {
  users: "👥 Пользователи",
  contacts: "📇 Контакты",
  content: "📄 Контент",
  orders: "🛒 Заказы",
  deals: "💼 Сделки",
  products: "📦 Продукты",
  payments: "💳 Платежи",
  emails: "✉️ Email",
  audit: "📋 Аудит",
  entitlements: "🔑 Доступы",
  roles: "🛡️ Роли",
  support: "🎧 Поддержка",
  integrations: "🔗 Интеграции",
  settings: "⚙️ Настройки",
};

export function RolePermissionEditor({
  open,
  onOpenChange,
  roleName,
  roleCode,
  allPermissions,
  selectedPermissions,
  onSave,
  isLoading = false,
}: RolePermissionEditorProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(selectedPermissions)
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);

  // Группируем права по категориям
  const permissionsByCategory = useMemo(() => {
    const grouped: Record<string, Permission[]> = {};
    allPermissions.forEach((perm) => {
      const category = perm.category || "other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(perm);
    });
    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => {
        const aIsView = a.code.endsWith(".view") ? 0 : 1;
        const bIsView = b.code.endsWith(".view") ? 0 : 1;
        return aIsView - bIsView || a.name.localeCompare(b.name);
      });
    });
    return grouped;
  }, [allPermissions]);

  // Фильтруем по поиску
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return permissionsByCategory;
    const searchLower = search.toLowerCase();
    const filtered: Record<string, Permission[]> = {};
    Object.entries(permissionsByCategory).forEach(([category, perms]) => {
      const matchingPerms = perms.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.code.toLowerCase().includes(searchLower)
      );
      if (matchingPerms.length > 0) {
        filtered[category] = matchingPerms;
      }
    });
    return filtered;
  }, [permissionsByCategory, search]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const togglePermission = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAllView = () => {
    const viewPerms = allPermissions
      .filter((p) => p.code.endsWith(".view"))
      .map((p) => p.code);
    setSelected(new Set(viewPerms));
  };

  const selectAllInCategory = (category: string) => {
    const catPerms = permissionsByCategory[category] || [];
    setSelected((prev) => {
      const next = new Set(prev);
      catPerms.forEach((p) => next.add(p.code));
      return next;
    });
  };

  const deselectAllInCategory = (category: string) => {
    const catPerms = permissionsByCategory[category] || [];
    const catCodes = new Set(catPerms.map((p) => p.code));
    setSelected((prev) => {
      const next = new Set(prev);
      catCodes.forEach((code) => next.delete(code));
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(allPermissions.map((p) => p.code)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(Array.from(selected));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const viewCount = Array.from(selected).filter((c) =>
    c.endsWith(".view")
  ).length;
  const editCount = selected.size - viewCount;

  const getCategoryStats = (category: string) => {
    const catPerms = permissionsByCategory[category] || [];
    const selectedCount = catPerms.filter((p) => selected.has(p.code)).length;
    return { total: catPerms.length, selected: selectedCount };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        {/* ── Header zone (shrink-0, не скроллится) ── */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border/30 bg-card/60 backdrop-blur-xl">
          {/* Title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight truncate">
                Права: {roleName}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-[11px]">{roleCode}</code>
              </p>
            </div>
          </div>

          {/* Quick actions + counters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllView}
              className="h-7 text-xs rounded-full px-3 border-border/40"
            >
              <Eye className="h-3 w-3 mr-1" />
              Просмотр
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="h-7 text-xs rounded-full px-3 border-border/40"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              Все
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={deselectAll}
              className="h-7 text-xs rounded-full px-3 border-border/40"
            >
              <Square className="h-3 w-3 mr-1" />
              Снять
            </Button>
            <div className="flex-1" />
            <Badge
              variant="secondary"
              className="h-6 text-[11px] rounded-full bg-muted/40 border border-border/30 font-normal"
            >
              <Eye className="h-3 w-3 mr-1 opacity-60" />
              {viewCount}
            </Badge>
            <Badge
              variant="secondary"
              className="h-6 text-[11px] rounded-full bg-primary/10 border border-primary/20 text-primary font-normal"
            >
              <Pencil className="h-3 w-3 mr-1 opacity-60" />
              {editCount}
            </Badge>
          </div>
        </div>

        {/* ── Body zone (scrollable, flex-1 min-h-0) ── */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6">
            {/* Sticky search */}
            <div className="sticky top-0 z-10 pt-3 pb-2 bg-card/80 backdrop-blur-xl border-b border-border/20">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Поиск прав..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 bg-muted/30 border-border/30 rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Category accordions */}
            <div className="space-y-1 py-3">
              <TooltipProvider delayDuration={400}>
                {Object.entries(filteredCategories).map(([category, perms]) => {
                  const stats = getCategoryStats(category);
                  const isExpanded = expandedCategories.has(category);
                  const allSelected = stats.selected === stats.total;
                  const someSelected = stats.selected > 0 && !allSelected;

                  return (
                    <Collapsible
                      key={category}
                      open={isExpanded}
                      onOpenChange={() => toggleCategory(category)}
                    >
                      {/* Category row */}
                      <div
                        className="flex items-center gap-2.5 h-11 px-3 rounded-xl transition-colors transition-shadow duration-200 hover:bg-muted/40 hover:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)] cursor-pointer"
                      >
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => {
                            if (checked) selectAllInCategory(category);
                            else deselectAllInCategory(category);
                          }}
                          className={someSelected ? "opacity-50" : ""}
                        />

                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <span className="font-medium text-sm truncate">
                              {categoryLabels[category] || category}
                            </span>
                            <div className="flex-1" />
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px] rounded-full border-border/30 bg-muted/30 font-normal shrink-0 tabular-nums"
                            >
                              {stats.selected}/{stats.total}
                            </Badge>
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                            )}
                          </button>
                        </CollapsibleTrigger>
                      </div>

                      {/* Permissions inside category */}
                      <CollapsibleContent>
                        <div className="ml-4 space-y-0.5 py-1">
                          {perms.map((perm) => {
                            const isView = perm.code.endsWith(".view");
                            return (
                              <Tooltip key={perm.id}>
                                <TooltipTrigger asChild>
                                  <label className="flex items-center gap-2.5 py-2.5 px-3 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-muted/30">
                                    <Checkbox
                                      checked={selected.has(perm.code)}
                                      onCheckedChange={() =>
                                        togglePermission(perm.code)
                                      }
                                    />
                                    <span className="flex-1 text-sm truncate">
                                      {perm.name}
                                    </span>
                                    {isView ? (
                                      <Eye className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                    ) : (
                                      <Pencil className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                                    )}
                                  </label>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  {perm.code}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>
        </ScrollArea>

        {/* ── Footer zone (shrink-0, не скроллится) ── */}
        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border/30 bg-card/60 backdrop-blur-xl">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || isLoading}
            className="h-10 rounded-xl"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
