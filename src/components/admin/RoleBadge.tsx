import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoleDisplayName, getRoleBadgeStyle } from "@/lib/roles";

interface Role {
  code: string;
  name: string;
}

interface RoleBadgeProps {
  role: Role;
  onRemove?: () => void;
  canRemove?: boolean;
  className?: string;
}

export function RoleBadge({ role, onRemove, canRemove = false, className }: RoleBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "flex items-center gap-1 text-xs",
        getRoleBadgeStyle(role.code),
        className
      )}
    >
      {getRoleDisplayName(role)}
      {canRemove && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:opacity-70 transition-opacity"
          aria-label={`Удалить роль ${getRoleDisplayName(role)}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </Badge>
  );
}
