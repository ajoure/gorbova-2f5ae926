import { useState, useRef, useCallback, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => Promise<void>;
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (scrollTop > 0) {
      setPulling(false);
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0) {
      // Apply resistance
      const distance = Math.min(diff * 0.5, threshold * 1.5);
      setPullDistance(distance);
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    
    setPulling(false);
    
    if (pullDistance >= threshold) {
      setRefreshing(true);
      
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
      
      setRefreshing(false);
    }
    
    setPullDistance(0);
  }, [pulling, pullDistance, onRefresh]);

  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorScale = 0.5 + (indicatorOpacity * 0.5);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center transition-transform duration-200"
        style={{
          top: Math.max(pullDistance - 40, -40),
          opacity: indicatorOpacity,
          transform: `translateX(-50%) scale(${indicatorScale})`,
        }}
      >
        <div className="bg-background border border-border rounded-full p-2 shadow-lg">
          <Loader2 
            className={`h-5 w-5 text-primary ${refreshing ? 'animate-spin' : ''}`}
            style={{
              transform: refreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content with pull offset */}
      <div
        className="min-h-full"
        style={{
          transform: `translateY(${refreshing ? threshold / 2 : pullDistance}px)`,
          transition: pulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
