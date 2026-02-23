import { useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface RichTextareaProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  /** Inline mode — single-line look, compact padding, no min-height */
  inline?: boolean;
}

export function RichTextarea({
  value,
  onChange,
  placeholder = "Введите текст...",
  className,
  minHeight = "100px",
  inline = false,
}: RichTextareaProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

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

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden bg-background",
      inline && "rounded-md",
      className
    )}>
      <div
        ref={editorRef}
        contentEditable
        data-rich-editable="true"
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className={cn(
          "outline-none",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none",
          inline
            ? "px-3 py-2 text-sm min-h-[36px]"
            : "p-3 text-sm"
        )}
        style={inline ? undefined : { minHeight }}
        suppressContentEditableWarning
      />
    </div>
  );
}
