import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePickerWheel } from "@/components/ui/time-picker-wheel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DateTimePickerProps {
  date: Date | undefined;
  time: string;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  disabled,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"date" | "time">("date");

  const handleDateSelect = (newDate: Date | undefined) => {
    onDateChange(newDate);
    if (!newDate) {
      onTimeChange("");
    } else if (newDate && !time) {
      // Auto-switch to time tab when date is selected
      setActiveTab("time");
    }
  };

  const displayValue = React.useMemo(() => {
    if (!date) return "Выберите дату";
    const dateStr = format(date, "dd.MM.yyyy", { locale: ru });
    if (time) {
      return `${dateStr} в ${time}`;
    }
    return dateStr;
  }, [date, time]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-0 overflow-hidden" 
        align="start"
        sideOffset={4}
      >
        <div className="bg-background rounded-xl border border-input shadow-lg">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "date" | "time")}>
            <TabsList className="w-full grid grid-cols-2 bg-muted/30 rounded-none border-b border-border/50">
              <TabsTrigger 
                value="date" 
                className="flex items-center gap-2 data-[state=active]:bg-background rounded-none rounded-tl-xl"
              >
                <CalendarIcon className="h-4 w-4" />
                Дата
              </TabsTrigger>
              <TabsTrigger 
                value="time" 
                disabled={!date}
                className="flex items-center gap-2 data-[state=active]:bg-background rounded-none rounded-tr-xl"
              >
                <Clock className="h-4 w-4" />
                Время
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="date" className="m-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                initialFocus
                className="pointer-events-auto p-3"
              />
            </TabsContent>
            
            <TabsContent value="time" className="m-0">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Checkbox 
                    id="no-time" 
                    checked={!time}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onTimeChange("");
                      } else {
                        onTimeChange("12:00");
                      }
                    }}
                  />
                  <label htmlFor="no-time" className="text-sm cursor-pointer">
                    Без точного времени
                  </label>
                </div>
                {time && (
                  <TimePickerWheel
                    value={time}
                    onChange={onTimeChange}
                    disabled={!date}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          {/* Footer with current selection */}
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-3 bg-muted/20">
            <div className="text-sm text-muted-foreground">
              {date ? (
                <span>
                  {format(date, "d MMMM yyyy", { locale: ru })}
                  {time && <span className="text-foreground font-medium"> • {time}</span>}
                </span>
              ) : (
                "Дата не выбрана"
              )}
            </div>
            <div className="flex gap-2">
              {date && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onDateChange(undefined);
                    onTimeChange("");
                  }}
                  className="text-muted-foreground"
                >
                  Очистить
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setOpen(false)}
              >
                Готово
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
