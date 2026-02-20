import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon, X, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export interface DatePickerProps {
  value?: string; // yyyy-MM-dd
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string; // yyyy-MM-dd
  maxDate?: string; // yyyy-MM-dd
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Выбрать дату...",
  minDate,
  maxDate,
  className,
  disabled,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const dateValue = value ? parseISO(value) : undefined;
  const minDateObj = minDate ? parseISO(minDate) : undefined;
  const maxDateObj = maxDate ? parseISO(maxDate) : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label className="text-[11px] text-muted-foreground/80 font-medium">{label}</Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full h-9 justify-start text-left text-xs font-normal",
              "bg-muted/40 border-border/40 rounded-lg",
              "hover:bg-muted/60 hover:border-border/60",
              "focus:ring-2 focus:ring-primary/20",
              "transition-all duration-200",
              !dateValue && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            {dateValue ? format(dateValue, "d MMM yyyy", { locale: ru }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className={cn(
            "w-auto p-0 z-[100]",
            "bg-background/95 backdrop-blur-xl",
            "border-border/50 shadow-2xl",
            "rounded-2xl overflow-hidden",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "yyyy-MM-dd"));
              }
              setOpen(false);
            }}
            disabled={(date) => {
              if (minDateObj && date < minDateObj) return true;
              if (maxDateObj && date > maxDateObj) return true;
              return false;
            }}
            locale={ru}
            initialFocus
            className={cn(
              "p-3 pointer-events-auto",
              "[&_.rdp-day_focus]:ring-2 [&_.rdp-day_focus]:ring-primary/30",
              "[&_.rdp-day_selected]:bg-primary [&_.rdp-day_selected]:text-primary-foreground",
              "[&_.rdp-day_today]:bg-accent/60 [&_.rdp-day_today]:font-semibold"
            )}
          />
          <div className="flex items-center justify-between p-2 pt-0 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Очистить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(format(new Date(), "yyyy-MM-dd"));
                setOpen(false);
              }}
            >
              <CalendarDays className="h-3 w-3 mr-1" />
              Сегодня
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
