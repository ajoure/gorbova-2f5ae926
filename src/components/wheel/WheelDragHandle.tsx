import { useState, useRef, useCallback, useEffect } from "react";

interface DragHandleProps {
  x: number;
  y: number;
  value: number;
  color: string;
  stageKey: string;
  angle: number;
  centerX: number;
  centerY: number;
  onValueChange: (value: number) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
}

export function WheelDragHandle({
  x,
  y,
  value,
  color,
  stageKey,
  angle,
  centerX,
  centerY,
  onValueChange,
  isHovered,
  onHover,
  onClick,
}: DragHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    const svg = (e.target as SVGElement).closest('svg');
    if (svg) svgRef.current = svg;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const svgWidth = rect.width;
    const svgHeight = rect.height;
    
    // Convert mouse position to SVG coordinates (0-200 scale)
    const mouseX = ((e.clientX - rect.left) / svgWidth) * 200;
    const mouseY = ((e.clientY - rect.top) / svgHeight) * 200;
    
    // Calculate distance from center
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate angle of mouse from center
    const mouseAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Calculate angle difference to constrain to ray
    const angleDiff = Math.abs(((mouseAngle - angle + 180) % 360) - 180);
    
    // Only update if within 30 degrees of the stage's ray
    if (angleDiff < 30 || angleDiff > 330) {
      // Convert distance to value (15-90 radius range maps to 1-10)
      const minRadius = 15;
      const maxRadius = 90;
      const clampedDistance = Math.max(minRadius, Math.min(maxRadius, distance));
      const newValue = Math.round(((clampedDistance - minRadius) / (maxRadius - minRadius)) * 9 + 1);
      
      if (newValue !== value) {
        onValueChange(newValue);
      }
    }
  }, [isDragging, centerX, centerY, angle, value, onValueChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add global mouse listeners when dragging
  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <circle
      cx={x}
      cy={y}
      r={isDragging ? 12 : isHovered ? 10 : 7}
      fill={color}
      stroke="hsl(var(--background))"
      strokeWidth="2"
      style={{
        cursor: isDragging ? "grabbing" : "grab",
        transition: isDragging ? "none" : "r 0.2s ease",
        filter: isDragging ? "drop-shadow(0 0 8px rgba(0,0,0,0.3))" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => !isDragging && onHover(false)}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
    />
  );
}
