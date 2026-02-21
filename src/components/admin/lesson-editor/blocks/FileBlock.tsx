import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FileContent } from "@/hooks/useLessonBlocks";
import { FileText, ExternalLink, Upload, Loader2 } from "lucide-react";
import { getFileTypeIcon } from "./fileTypeIcons";
import { toast } from "sonner";
import { uploadToTrainingAssets, formatFileSize, extractStoragePathFromPublicUrl, deleteTrainingAssets } from "./uploadToTrainingAssets";

interface FileBlockProps {
  content: FileContent;
  onChange: (content: FileContent) => void;
  isEditing?: boolean;
  lessonId?: string;
}

// Allowlist расширений для FileBlock — без MIME-проверки, т.к. application/* нестабилен
const ALLOWED_FILE_EXTENSIONS = [
  ".pdf", ".doc", ".docx",
  ".xls", ".xlsx",
  ".ppt", ".pptx",
  ".zip", ".rar",
  ".txt", ".csv", ".rtf",
];

function formatFileSizeDisplay(bytes?: number): string {
  if (!bytes) return "";
  return formatFileSize(bytes);
}

export function FileBlock({ content, onChange, isEditing = true, lessonId }: FileBlockProps) {
  const [localUrl, setLocalUrl] = useState(content.url || "");
  const [localName, setLocalName] = useState(content.name || "");
  const [localSize, setLocalSize] = useState(content.size?.toString() || "");
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUrlBlur = () => {
    onChange({ ...content, url: localUrl });
  };

  const handleNameBlur = () => {
    onChange({ ...content, name: localName });
  };

  const handleSizeBlur = () => {
    onChange({ ...content, size: localSize ? parseInt(localSize) : undefined });
  };

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);
      // Нормализуем ownerId один раз — чтобы путь в Storage и entity.id совпадали
      const ownerId = (lessonId || "").trim();
      const entity = ownerId ? { type: "lesson", id: ownerId } : undefined;

      // Сохраняем предыдущий storagePath для удаления после замены
      const prevPath = (content as any).storagePath as string | undefined
        || (localUrl ? extractStoragePathFromPublicUrl(localUrl) : null);

      const result = await uploadToTrainingAssets(
        file,
        "lesson-files",
        50,
        undefined,
        ALLOWED_FILE_EXTENSIONS,
        ownerId // нормализованный ownerId → lesson-files/<lessonId>/...
      );
      if (result) {
        const { publicUrl, storagePath } = result;
        setLocalUrl(publicUrl);
        setLocalName(file.name);
        setLocalSize(String(file.size));
        onChange({
          ...content,
          url: publicUrl,
          name: file.name,
          size: file.size,
          storagePath,
        } as FileContent & { storagePath?: string });
        toast.success("Файл загружен");
        // Удаляем старый файл из Storage (fire-and-forget)
        if (prevPath && prevPath !== storagePath) {
          deleteTrainingAssets([prevPath], entity, "file_replaced");
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Сброс input чтобы можно было загрузить тот же файл повторно
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Режим просмотра (для студента) — скачивание запрещено, только просмотр
  if (!isEditing) {
    if (!content.url) {
      return (
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <span className="text-muted-foreground">Файл не загружен</span>
        </div>
      );
    }

    const fileIcon = getFileTypeIcon(content.name);
    return (
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 select-none">
        <fileIcon.Icon className={`h-8 w-8 shrink-0 ${fileIcon.colorClass}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{content.name || "Файл"}</p>
          {content.size && (
            <p className="text-sm text-muted-foreground">{formatFileSizeDisplay(content.size)}</p>
          )}
        </div>
      </div>
    );
  }

  // Режим редактирования
  return (
    <div className="space-y-3">
      {/* Drag & Drop зона загрузки */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.rtf"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            </>
          ) : (
            <>
              <FileText className="h-8 w-8 text-muted-foreground" />
              <Button
                variant="outline"
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Загрузить файл
              </Button>
              <p className="text-xs text-muted-foreground">
                или перетащите файл сюда • PDF, Word, Excel, PowerPoint, ZIP, TXT • до 50 МБ
              </p>
            </>
          )}
        </div>
      </div>

      {/* URL поле */}
      <div className="space-y-1.5">
        <Label>URL файла</Label>
        <div className="flex gap-2">
          <Input
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="https://..."
            className="flex-1"
            disabled={uploading}
          />
          {content.url && (
            <a
              href={content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-input bg-background hover:bg-accent shrink-0"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Название файла</Label>
          <Input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="document.pdf"
            disabled={uploading}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Размер (bytes)</Label>
          <Input
            type="number"
            value={localSize}
            onChange={(e) => setLocalSize(e.target.value)}
            onBlur={handleSizeBlur}
            placeholder="1024"
            disabled={uploading}
          />
        </div>
      </div>

      {/* Превью загруженного файла */}
      {content.url && content.name && (() => {
        const previewIcon = getFileTypeIcon(content.name);
        return (
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
          <previewIcon.Icon className={`h-6 w-6 shrink-0 ${previewIcon.colorClass}`} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{content.name}</p>
            {content.size && (
              <p className="text-xs text-muted-foreground">{formatFileSizeDisplay(content.size)}</p>
            )}
          </div>
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
          </a>
        </div>
        );
      })()}
    </div>
  );
}
