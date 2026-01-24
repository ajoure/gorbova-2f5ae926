import { useState, useRef, useCallback } from "react";

interface SwipeActionsOptions {
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
}

export function useSwipeActions({
  threshold = 80,
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
}: SwipeActionsOptions = {}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      isHorizontalSwipeRef.current = null;
      setIsSwiping(true);
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !isSwiping) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - startXRef.current;
      const diffY = currentY - startYRef.current;

      // Determine swipe direction on first significant movement
      if (isHorizontalSwipeRef.current === null) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
          isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
        }
      }

      // Only handle horizontal swipes
      if (isHorizontalSwipeRef.current) {
        e.preventDefault();
        // Limit swipe distance
        const limitedOffset = Math.max(-150, Math.min(150, diffX));
        setOffsetX(limitedOffset);
      }
    },
    [disabled, isSwiping]
  );

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;

    if (offsetX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (offsetX > threshold && onSwipeRight) {
      onSwipeRight();
    }

    setOffsetX(0);
    setIsSwiping(false);
    isHorizontalSwipeRef.current = null;
  }, [disabled, offsetX, threshold, onSwipeLeft, onSwipeRight]);

  const swipeHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };

  const swipeStyle = {
    transform: `translateX(${offsetX}px)`,
    transition: isSwiping ? "none" : "transform 0.2s ease-out",
  };

  const swipeDirection = offsetX < -threshold ? "left" : offsetX > threshold ? "right" : null;

  return {
    swipeHandlers,
    swipeStyle,
    offsetX,
    isSwiping,
    swipeDirection,
  };
}
