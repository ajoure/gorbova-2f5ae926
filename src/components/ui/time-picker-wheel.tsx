import * as React from "react";
import { cn } from "@/lib/utils";

interface TimePickerWheelProps {
  value: string; // "HH:mm" format
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"));

interface WheelColumnProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function WheelColumn({ items, value, onChange, disabled }: WheelColumnProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemHeight = 36;
  const visibleItems = 5;
  const centerIndex = Math.floor(visibleItems / 2);
  
  const currentIndex = items.indexOf(value);
  
  // Scroll to current value on mount and value change
  React.useEffect(() => {
    if (containerRef.current && currentIndex >= 0) {
      const scrollTop = currentIndex * itemHeight;
      containerRef.current.scrollTop = scrollTop;
    }
  }, [currentIndex, value]);

  const handleScroll = React.useCallback(() => {
    if (!containerRef.current || disabled) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const newIndex = Math.round(scrollTop / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    
    if (items[clampedIndex] !== value) {
      onChange(items[clampedIndex]);
    }
  }, [items, value, onChange, disabled, itemHeight]);

  // Debounced scroll handler for snap behavior
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout>();
  
  const handleScrollEnd = React.useCallback(() => {
    if (!containerRef.current || disabled) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const newIndex = Math.round(scrollTop / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, newIndex));
    
    // Snap to nearest item
    containerRef.current.scrollTo({
      top: clampedIndex * itemHeight,
      behavior: "smooth"
    });
    
    if (items[clampedIndex] !== value) {
      onChange(items[clampedIndex]);
    }
  }, [items, value, onChange, disabled, itemHeight]);

  const onScroll = () => {
    handleScroll();
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(handleScrollEnd, 100);
  };

  const handleItemClick = (item: string, index: number) => {
    if (disabled) return;
    onChange(item);
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: index * itemHeight,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="relative h-[180px] w-[60px]">
      {/* Selection highlight */}
      <div 
        className="absolute left-0 right-0 pointer-events-none z-10 rounded-lg bg-primary/10 border border-primary/20"
        style={{ 
          top: `${centerIndex * itemHeight}px`, 
          height: `${itemHeight}px` 
        }}
      />
      
      {/* Gradient overlays for fade effect */}
      <div className="absolute inset-x-0 top-0 h-[72px] bg-gradient-to-b from-background to-transparent pointer-events-none z-20" />
      <div className="absolute inset-x-0 bottom-0 h-[72px] bg-gradient-to-t from-background to-transparent pointer-events-none z-20" />
      
      {/* Scrollable container */}
      <div
        ref={containerRef}
        className={cn(
          "h-full overflow-y-auto scrollbar-hide scroll-smooth",
          disabled && "opacity-50 pointer-events-none"
        )}
        style={{ 
          scrollSnapType: "y mandatory",
          paddingTop: `${centerIndex * itemHeight}px`,
          paddingBottom: `${centerIndex * itemHeight}px`
        }}
        onScroll={onScroll}
      >
        {items.map((item, index) => {
          const isSelected = item === value;
          return (
            <div
              key={item}
              className={cn(
                "flex items-center justify-center cursor-pointer transition-all duration-150",
                "text-lg font-medium select-none",
                isSelected 
                  ? "text-foreground scale-105" 
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              style={{ 
                height: `${itemHeight}px`,
                scrollSnapAlign: "center"
              }}
              onClick={() => handleItemClick(item, index)}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimePickerWheel({ value, onChange, disabled, className }: TimePickerWheelProps) {
  const [hours, minutes] = React.useMemo(() => {
    const parts = value.split(":");
    return [parts[0] || "12", parts[1] || "00"];
  }, [value]);

  const handleHoursChange = (newHours: string) => {
    onChange(`${newHours}:${minutes}`);
  };

  const handleMinutesChange = (newMinutes: string) => {
    onChange(`${hours}:${newMinutes}`);
  };

  return (
    <div className={cn("flex items-center justify-center gap-1 p-4", className)}>
      <WheelColumn
        items={HOURS}
        value={hours}
        onChange={handleHoursChange}
        disabled={disabled}
      />
      
      <div className="text-xl font-semibold text-foreground">:</div>
      
      <WheelColumn
        items={MINUTES}
        value={minutes}
        onChange={handleMinutesChange}
        disabled={disabled}
      />
    </div>
  );
}
