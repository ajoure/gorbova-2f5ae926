import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  ShieldCheck,
  Eye,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Lock,
  Crown,
  UserCog,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoleDisplayName, getRoleIconColors } from "@/lib/roles";

interface Permission {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

interface RoleCardProps {
  role: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    permissions: Permission[];
  };
  userCount?: number;
  isSystemRole: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

type AccessType = "view_only" | "full" | "partial" | "empty";

const getAccessType = (permissions: Permission[]): AccessType => {
  if (permissions.length === 0) return "empty";
  const hasOnlyView = permissions.every((p) => p.code.endsWith(".view"));
  const hasEditOrManage = permissions.some(
    (p) =>
      p.code.endsWith(".edit") ||
      p.code.endsWith(".manage") ||
      p.code.endsWith(".update") ||
      p.code.endsWith(".delete") ||
      p.code.endsWith(".create")
  );
  if (hasOnlyView) return "view_only";
  if (hasEditOrManage && permissions.length > 5) return "full";
  return "partial";
};

const accessTypeConfig: Record<
  AccessType,
  { label: string; icon: React.ElementType; className: string }
> = {
  view_only: { label: "Только просмотр", icon: Eye, className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  full: { label: "Полный доступ", icon: ShieldCheck, className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  partial: { label: "Частичный доступ", icon: Shield, className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  empty: { label: "Без прав", icon: Lock, className: "bg-muted/50 text-muted-foreground border-border/30" },
};

const roleIconMap: Record<string, React.ElementType> = {
  super_admin: Crown,
  admin: ShieldCheck,
  admin_gost: Eye,
  news_editor: Newspaper,
  manager: UserCog,
  default: Shield,
};

const categoryLabels: Record<string, string> = {
  users: "Пользователи",
  contacts: "Контакты",
  content: "Контент",
  orders: "Заказы",
  deals: "Сделки",
  products: "Продукты",
  payments: "Платежи",
  emails: "Email",
  audit: "Аудит",
  entitlements: "Доступы",
  roles: "Роли",
  support: "Поддержка",
  integrations: "Интеграции",
  settings: "Настройки",
  other: "Другое",
};

export function RoleCard({
  role,
  userCount = 0,
  isSystemRole,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: RoleCardProps) {
  const accessType = getAccessType(role.permissions);
  const config = accessTypeConfig[accessType];
  const AccessIcon = config.icon;
  const RoleIcon = roleIconMap[role.code] || roleIconMap.default;
  const iconColors = getRoleIconColors(role.code);

  const permissionsByCategory = role.permissions.reduce((acc, perm) => {
    const category = perm.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryCount = Object.keys(permissionsByCategory).length;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/30 p-5 transition-all duration-300",
        "hover:shadow-[0_8px_32px_rgba(0,0,0,0.12)] hover:border-border/50 hover:-translate-y-0.5",
        "backdrop-blur-xl"
      )}
      style={{
        background: "linear-gradient(135deg, hsl(var(--card) / 0.5), hsl(var(--card) / 0.25))",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl", iconColors.bg)}>
            <RoleIcon className={cn("h-5 w-5", iconColors.text)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base">{getRoleDisplayName(role)}</h3>
              {isSystemRole && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-border/40 text-muted-foreground">
                  <Lock className="h-2.5 w-2.5 mr-0.5" />
                  Системная
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
              {role.description || `Код: ${role.code}`}
            </p>
          </div>
        </div>

        {(canEdit || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="backdrop-blur-xl bg-popover/90 border-border/40">
              {canEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Редактировать права
                </DropdownMenuItem>
              )}
              {canDelete && !isSystemRole && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить роль
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge variant="outline" className={cn("gap-1 text-xs border", config.className)}>
          <AccessIcon className="h-3 w-3" />
          {config.label}
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs border-border/30 text-muted-foreground">
          <Shield className="h-3 w-3" />
          {role.permissions.length}
        </Badge>
        {userCount > 0 && (
          <Badge variant="outline" className="gap-1 text-xs border-border/30 text-muted-foreground">
            <Users className="h-3 w-3" />
            {userCount}
          </Badge>
        )}
      </div>

      {/* Categories */}
      {role.permissions.length > 0 && (
        <div className="text-xs text-muted-foreground/80">
          {Object.keys(permissionsByCategory)
            .slice(0, 3)
            .map((cat) => categoryLabels[cat] || cat)
            .join(" · ")}
          {categoryCount > 3 && ` · +${categoryCount - 3}`}
        </div>
      )}
    </div>
  );
}
