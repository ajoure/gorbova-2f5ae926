import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
} from "lucide-react";

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
  { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  view_only: { label: "Только просмотр", icon: Eye, variant: "secondary" },
  full: { label: "Полный доступ", icon: ShieldCheck, variant: "default" },
  partial: { label: "Частичный доступ", icon: Shield, variant: "outline" },
  empty: { label: "Без прав", icon: Lock, variant: "destructive" },
};

const roleIconMap: Record<string, React.ElementType> = {
  super_admin: Crown,
  admin: ShieldCheck,
  admin_gost: Eye,
  manager: UserCog,
  default: Shield,
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

  // Группируем права по категориям для отображения
  const permissionsByCategory = role.permissions.reduce((acc, perm) => {
    const category = perm.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryCount = Object.keys(permissionsByCategory).length;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <RoleIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">{role.name}</h3>
                {isSystemRole && (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Системная
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
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
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant={config.variant} className="gap-1">
            <AccessIcon className="h-3 w-3" />
            {config.label}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            {role.permissions.length} прав
          </Badge>
          {userCount > 0 && (
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {userCount} польз.
            </Badge>
          )}
        </div>

        {role.permissions.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">Категории: </span>
            {Object.keys(permissionsByCategory)
              .slice(0, 4)
              .map((cat) => getCategoryLabel(cat))
              .join(", ")}
            {categoryCount > 4 && ` +${categoryCount - 4}`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
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
  return labels[category] || category;
}
