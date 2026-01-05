import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X } from "lucide-react";

interface OfferRowCompactProps {
  offer: {
    id: string;
    offer_type: "pay_now" | "trial";
    button_label: string;
    amount: number;
    trial_days: number | null;
    auto_charge_after_trial: boolean;
    auto_charge_amount: number | null;
    is_active: boolean;
  };
  onToggleActive: (id: string, isActive: boolean) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function OfferRowCompact({
  offer,
  onToggleActive,
  onUpdateLabel,
  onEdit,
  onDelete,
}: OfferRowCompactProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(offer.button_label);

  const handleSave = () => {
    if (editValue.trim() && editValue !== offer.button_label) {
      onUpdateLabel(offer.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(offer.button_label);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
      {/* Left: Type badge + Label */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Badge 
          variant={offer.offer_type === "trial" ? "secondary" : "default"}
          className="shrink-0"
        >
          {offer.offer_type === "trial" ? "Trial" : "Оплата"}
        </Badge>
        
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-sm"
                autoFocus
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
                <Check className="h-4 w-4 text-green-500" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <div 
              onClick={() => setIsEditing(true)}
              className="cursor-pointer hover:text-primary transition-colors"
            >
              <div className="font-medium truncate">{offer.button_label}</div>
              <div className="text-xs text-muted-foreground">
                {offer.amount} BYN
                {offer.offer_type === "trial" && (
                  <>
                    {" "}• {offer.trial_days} дней
                    {offer.auto_charge_after_trial && (
                      <span className="text-amber-600">
                        {" "}→ {offer.auto_charge_amount} BYN
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Toggle + Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={offer.is_active}
          onCheckedChange={(checked) => onToggleActive(offer.id, checked)}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
