import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Code } from "lucide-react";

export interface HtmlRawContentData {
  html: string;
  title?: string;
}

interface HtmlRawBlockProps {
  content: HtmlRawContentData;
  onChange: (content: HtmlRawContentData) => void;
  isEditing?: boolean;
}

/** Wrap user HTML in a full document with auto-resize script */
function buildSrcdoc(html: string): string {
  const resizeScript = `
<script>
  function postHeight() {
    window.parent.postMessage({ type: 'iframe-resize', height: document.body.scrollHeight + 20 }, '*');
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  new ResizeObserver(postHeight).observe(document.body);
  setTimeout(postHeight, 300);
</script>`;

  // If html already has <html> or <body>, inject script before </body>
  if (/<<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${resizeScript}</body>`);
  }
  // Otherwise wrap in a full document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base target="_blank">
  <style>body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }</style>
</head>
<body>
${html}
${resizeScript}
</body>
</html>`;
}

function IframePreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-resize' && typeof e.data.height === 'number') {
        setHeight(Math.max(100, Math.min(e.data.height, 5000)));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!html.trim()) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Code className="h-8 w-8 mr-2 opacity-50" />
        <span>Вставьте HTML-код</span>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={buildSrcdoc(html)}
      sandbox="allow-scripts"
      style={{ width: '100%', height: `${height}px`, border: 'none' }}
      title="HTML Preview"
    />
  );
}

export function HtmlRawBlock({ content, onChange, isEditing = true }: HtmlRawBlockProps) {
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleHtmlChange = useCallback((html: string) => {
    onChange({ ...content, html });
  }, [content, onChange]);

  // Student / preview mode
  if (!isEditing) {
    return <IframePreview html={content.html || ''} />;
  }

  // Admin editing mode
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Название (опционально)</Label>
        <Input
          value={content.title || ''}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Конспект урока"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>HTML-код</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? (
            <><Edit className="h-3.5 w-3.5 mr-1.5" />Редактор</>
          ) : (
            <><Eye className="h-3.5 w-3.5 mr-1.5" />Предпросмотр</>
          )}
        </Button>
      </div>

      {showPreview ? (
        <div className="border rounded-lg overflow-hidden">
          <IframePreview html={content.html || ''} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className="w-full min-h-[300px] p-3 border rounded-lg font-mono text-sm bg-muted/30 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          value={content.html || ''}
          onChange={(e) => handleHtmlChange(e.target.value)}
          placeholder="Вставьте HTML-код с CSS-стилями..."
          spellCheck={false}
        />
      )}

      {content.html && (
        <p className="text-xs text-muted-foreground">
          {content.html.length.toLocaleString()} символов · Рендерится в изолированном iframe
        </p>
      )}
    </div>
  );
}
