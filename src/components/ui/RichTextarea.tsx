import { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RichTextareaProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

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

function ToolbarButton({
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
        onClick();
      }}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors hover:bg-accent",
        active && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextarea({
  value,
  onChange,
  placeholder = "Введите текст...",
  className,
  minHeight = "100px",
}: RichTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);

  // Sync external value changes
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const emitChange = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const exec = useCallback(
    (command: string, val?: string) => {
      document.execCommand(command, false, val);
      emitChange();
    },
    [emitChange]
  );

  return (
    <div className={cn("border rounded-lg overflow-hidden bg-background", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 flex-wrap">
        <ToolbarButton onClick={() => exec("bold")} title="Жирный">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} title="Курсив">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} title="Подчёркнутый">
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("strikeThrough")} title="Зачёркнутый">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Color picker */}
        <Popover open={colorOpen} onOpenChange={setColorOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen(!colorOpen)}
              title="Цвет текста"
              className="p-1.5 rounded-md transition-colors hover:bg-accent"
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-5 gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec("foreColor", color);
                    setColorOpen(false);
                  }}
                  className="w-6 h-6 rounded-full border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Font size */}
        <Popover open={sizeOpen} onOpenChange={setSizeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSizeOpen(!sizeOpen)}
              title="Размер текста"
              className="p-1.5 rounded-md transition-colors hover:bg-accent"
            >
              <Type className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec("fontSize", size.value);
                  setSizeOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
              >
                {size.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className={cn(
          "p-3 text-sm outline-none",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
        )}
        style={{ minHeight }}
        suppressContentEditableWarning
      />
    </div>
  );
}
