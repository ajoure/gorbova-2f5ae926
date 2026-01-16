import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Shield, ShieldCheck, Sparkles } from "lucide-react";

interface Permission {
  id: string;
  code: string;
  name: string;
  category: string | null;
}

interface RoleTemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allPermissions: Permission[];
  onSelectTemplate: (permissionCodes: string[]) => void;
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  variant: "default" | "secondary" | "outline";
  getPermissions: (all: Permission[]) => string[];
}

const templates: Template[] = [
  {
    id: "view_only",
    name: "Только просмотр",
    description: "Доступ ко всем разделам в режиме чтения. Идеально для наблюдателей и аудиторов.",
    icon: Eye,
    variant: "secondary",
    getPermissions: (all) => all.filter((p) => p.code.endsWith(".view")).map((p) => p.code),
  },
  {
    id: "full_access",
    name: "Полный доступ",
    description: "Все права на просмотр и редактирование. Для администраторов.",
    icon: ShieldCheck,
    variant: "default",
    getPermissions: (all) => all.map((p) => p.code),
  },
  {
    id: "empty",
    name: "Пустая роль",
    description: "Начните с нуля и выберите права вручную.",
    icon: Shield,
    variant: "outline",
    getPermissions: () => [],
  },
];

export function RoleTemplateSelector({
  open,
  onOpenChange,
  allPermissions,
  onSelectTemplate,
}: RoleTemplateSelectorProps) {
  const handleSelect = (template: Template) => {
    const permissions = template.getPermissions(allPermissions);
    onSelectTemplate(permissions);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Выберите шаблон роли
          </DialogTitle>
          <DialogDescription>
            Шаблон определит начальный набор прав для новой роли
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {templates.map((template) => {
            const Icon = template.icon;
            const permCount = template.getPermissions(allPermissions).length;
            
            return (
              <Button
                key={template.id}
                variant={template.variant}
                className="w-full h-auto p-4 flex-col items-start gap-1"
                onClick={() => handleSelect(template)}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="h-5 w-5" />
                  <span className="font-semibold">{template.name}</span>
                  <span className="ml-auto text-xs opacity-70">
                    {permCount} прав
                  </span>
                </div>
                <p className="text-xs text-left opacity-70 font-normal">
                  {template.description}
                </p>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
