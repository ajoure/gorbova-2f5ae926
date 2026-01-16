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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  selectedPermissions: string[]; // permission codes
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

    // Сортируем права внутри категорий: view первые, потом остальные
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
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const togglePermission = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Редактирование прав: {roleName}
          </DialogTitle>
          <DialogDescription>
            Код роли: <code className="bg-muted px-1 rounded">{roleCode}</code>
          </DialogDescription>
        </DialogHeader>

        {/* Быстрые действия */}
        <div className="flex flex-wrap gap-2 py-2 border-b">
          <Button variant="outline" size="sm" onClick={selectAllView}>
            <Eye className="h-4 w-4 mr-1" />
            Все права просмотра
          </Button>
          <Button variant="outline" size="sm" onClick={selectAll}>
            <CheckSquare className="h-4 w-4 mr-1" />
            Выбрать все
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            <Square className="h-4 w-4 mr-1" />
            Снять все
          </Button>
          <div className="flex-1" />
          <Badge variant="secondary">
            <Eye className="h-3 w-3 mr-1" />
            {viewCount} просмотр
          </Badge>
          <Badge variant="default">
            <Pencil className="h-3 w-3 mr-1" />
            {editCount} изменение
          </Badge>
        </div>

        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск прав..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Список прав по категориям */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2 py-2">
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
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="p-0 h-auto">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>

                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectAllInCategory(category);
                        } else {
                          deselectAllInCategory(category);
                        }
                      }}
                      className={someSelected ? "opacity-50" : ""}
                    />

                    <CollapsibleTrigger asChild>
                      <button className="flex-1 text-left font-medium">
                        {categoryLabels[category] || category}
                      </button>
                    </CollapsibleTrigger>

                    <Badge variant="outline" className="text-xs">
                      {stats.selected}/{stats.total}
                    </Badge>
                  </div>

                  <CollapsibleContent>
                    <div className="ml-8 space-y-1 py-1">
                      {perms.map((perm) => {
                        const isView = perm.code.endsWith(".view");
                        return (
                          <label
                            key={perm.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer"
                          >
                            <Checkbox
                              checked={selected.has(perm.code)}
                              onCheckedChange={() => togglePermission(perm.code)}
                            />
                            <span className="flex-1">{perm.name}</span>
                            {isView ? (
                              <Eye className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
