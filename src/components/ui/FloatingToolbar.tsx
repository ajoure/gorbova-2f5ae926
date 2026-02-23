import { useEffect, useState, useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#000000", "#e03e3e", "#d9730d", "#dfab01",
  "#0f7b6c", "#0b6e99", "#6940a5", "#ad1a72",
  "#9b9a97", "#ffffff",
];

const FONT_SIZES = [
  { label: "Мелкий", value: "1" },
  { label: "Малый", value: "2" },
  { label: "Обычный", value: "3" },
  { label: "Средний", value: "4" },
  { label: "Большой", value: "5" },
  { label: "Крупный", value: "6" },
];

function ToolbarBtn({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors hover:bg-accent/80",
        active && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function FloatingToolbar() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showColors, setShowColors] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    // Trigger input event on the active editable element so onChange fires
    const el = document.activeElement;
    if (el && (el as HTMLElement).getAttribute("data-rich-editable")) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, []);

  const updatePosition = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setVisible(false);
      return;
    }

    // Check if selection is inside a [data-rich-editable] element
    let node: Node | null = sel.anchorNode;
    let editable: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.getAttribute("data-rich-editable")) {
        editable = node;
        break;
      }
      node = node.parentNode;
    }

    if (!editable) {
      setVisible(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setVisible(false);
      return;
    }

    const toolbarWidth = 320;
    const toolbarHeight = 40;

    let top = rect.top - toolbarHeight - 8;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;

    // Keep within viewport
    if (top < 4) top = rect.bottom + 8;
    if (left < 4) left = 4;
    if (left + toolbarWidth > window.innerWidth - 4) {
      left = window.innerWidth - toolbarWidth - 4;
    }

    setPosition({ top, left });
    setVisible(true);
  }, []);

  useEffect(() => {
    const onSelectionChange = () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(updatePosition, 150);
    };

    const onMouseUp = () => {
      setTimeout(updatePosition, 10);
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mouseup", onMouseUp);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [updatePosition]);

  // Hide on scroll
  useEffect(() => {
    const onScroll = () => {
      setVisible(false);
      setShowColors(false);
      setShowSizes(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);

  // Click outside to close sub-menus
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowColors(false);
        setShowSizes(false);
      }
    };
    if (visible) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "fixed z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg border bg-popover shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150"
      )}
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarBtn onClick={() => exec("bold")} title="Жирный">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => exec("italic")} title="Курсив">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => exec("underline")} title="Подчёркнутый">
        <Underline className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => exec("strikeThrough")} title="Зачёркнутый">
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <div className="w-px h-5 bg-border mx-0.5" />

      {/* Color picker */}
      <div className="relative">
        <ToolbarBtn
          onClick={() => { setShowColors(!showColors); setShowSizes(false); }}
          title="Цвет текста"
        >
          <Palette className="h-3.5 w-3.5" />
        </ToolbarBtn>
        {showColors && (
          <div className="absolute top-full left-0 mt-1 p-2 rounded-lg border bg-popover shadow-lg z-10">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec("foreColor", color);
                    setShowColors(false);
                  }}
                  className="w-5 h-5 rounded-full border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Font size */}
      <div className="relative">
        <ToolbarBtn
          onClick={() => { setShowSizes(!showSizes); setShowColors(false); }}
          title="Размер текста"
        >
          <Type className="h-3.5 w-3.5" />
        </ToolbarBtn>
        {showSizes && (
          <div className="absolute top-full left-0 mt-1 w-28 p-1 rounded-lg border bg-popover shadow-lg z-10">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec("fontSize", size.value);
                  setShowSizes(false);
                }}
                className="w-full text-left px-2 py-1 text-xs rounded-md hover:bg-accent transition-colors"
              >
                {size.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border mx-0.5" />

      <ToolbarBtn onClick={() => exec("justifyLeft")} title="По левому краю">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => exec("justifyCenter")} title="По центру">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn onClick={() => exec("justifyRight")} title="По правому краю">
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarBtn>
    </div>
  );
}
