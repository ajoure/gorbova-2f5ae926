import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { getFileTypeIcon } from "./fileTypeIcons";
import { toast } from "sonner";
import { uploadToTrainingAssets, deleteTrainingAssets, formatFileSize } from "./uploadToTrainingAssets";
import { useAuth } from "@/contexts/AuthContext";

export interface StudentUploadContentData {
  title: string;
  instructions?: string;
  allowedGroups: Array<"images" | "documents" | "spreadsheets" | "audio" | "video" | "archives">;
  maxSizeMB: number;
  required: boolean;
}

// Жёсткий blocklist исполняемых расширений
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".php", ".py", ".rb", ".pl", ".js", ".jsx", ".ts", ".tsx", ".mjs",
  ".jar", ".class", ".dll", ".so", ".dylib", ".app", ".dmg", ".msi",
  ".deb", ".rpm", ".apk", ".ipa", ".vbs", ".wsf", ".reg", ".inf",
  ".pif", ".lnk", ".scr", ".cpl", ".hta", ".com",
]);

const GROUP_EXTENSIONS: Record<string, string[]> = {
  images: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".heic"],
  documents: [".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt"],
  spreadsheets: [".xls", ".xlsx", ".ods", ".csv"],
  audio: [".mp3", ".wav", ".m4a", ".ogg", ".aac"],
  video: [".mp4", ".mov", ".avi", ".mkv", ".webm"],
  archives: [".zip", ".rar", ".7z"],
};

const GROUP_LABELS: Record<string, string> = {
  images: "Изображения",
  documents: "Документы (PDF, Word)",
  spreadsheets: "Таблицы",
  audio: "Аудио",
  video: "Видео",
  archives: "Архивы",
};

interface StudentUploadBlockProps {
  content: StudentUploadContentData;
  onChange: (content: StudentUploadContentData) => void;
  isEditing?: boolean;
  // Student-view props
  blockId?: string;
  lessonId?: string;
  savedResponse?: any;
  onSaved?: (fileData: any) => Promise<void>;
}

export function StudentUploadBlock({
  content,
  onChange,
  isEditing = true,
  blockId,
  lessonId,
  savedResponse,
  onSaved,
}: StudentUploadBlockProps) {
  if (isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <Label>Заголовок</Label>
          <Input
            value={content.title || ""}
            onChange={(e) => onChange({ ...content, title: e.target.value })}
            placeholder="Например: Загрузите домашнее задание"
          />
        </div>
        <div>
          <Label>Инструкция (необязательно)</Label>
          <Textarea
            value={content.instructions || ""}
            onChange={(e) => onChange({ ...content, instructions: e.target.value })}
            placeholder="Описание того, что нужно загрузить"
            rows={2}
          />
        </div>
        <div>
          <Label>Допустимые типы файлов</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {Object.entries(GROUP_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`group-${key}`}
                  checked={(content.allowedGroups || []).includes(key as any)}
                  onCheckedChange={(checked) => {
                    const groups = content.allowedGroups || [];
                    if (checked) {
                      onChange({ ...content, allowedGroups: [...groups, key as any] });
                    } else {
                      onChange({ ...content, allowedGroups: groups.filter((g) => g !== key) });
                    }
                  }}
                />
                <Label htmlFor={`group-${key}`} className="cursor-pointer text-sm">{label}</Label>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Label>Максимальный размер: {content.maxSizeMB || 50} МБ</Label>
          <Slider
            value={[content.maxSizeMB || 50]}
            onValueChange={([v]) => onChange({ ...content, maxSizeMB: v })}
            min={1}
            max={50}
            step={1}
            className="mt-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={content.required ?? false}
            onCheckedChange={(v) => onChange({ ...content, required: v })}
          />
          <Label>Обязательный</Label>
        </div>
      </div>
    );
  }

  return (
    <StudentUploadStudentView
      content={content}
      blockId={blockId}
      lessonId={lessonId}
      savedResponse={savedResponse}
      onSaved={onSaved}
    />
  );
}

function StudentUploadStudentView({
  content,
  blockId,
  lessonId,
  savedResponse,
  onSaved,
}: {
  content: StudentUploadContentData;
  blockId?: string;
  lessonId?: string;
  savedResponse?: any;
  onSaved?: (fileData: any) => Promise<void>;
}) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<any>(savedResponse?.type === "upload" ? savedResponse.file : null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = user?.id;

  const allowedExts = (content.allowedGroups || []).flatMap(
    (g) => GROUP_EXTENSIONS[g] || []
  );

  const validateFile = useCallback((file: File): boolean => {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");

    if (BLOCKED_EXTENSIONS.has(ext)) {
      toast.error("Этот тип файла запрещён");
      return false;
    }

    if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
      toast.error(`Допустимые форматы: ${allowedExts.join(", ")}`);
      return false;
    }

    const maxBytes = (content.maxSizeMB || 50) * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`Файл слишком большой. Максимум: ${content.maxSizeMB || 50} МБ`);
      return false;
    }

    return true;
  }, [allowedExts, content.maxSizeMB]);

  const handleUpload = useCallback(async (file: File) => {
    if (!validateFile(file) || !userId || !lessonId || !blockId) return;

    setUploading(true);
    try {
      const ownerId = `${userId}/${lessonId}/${blockId}`;
      const result = await uploadToTrainingAssets(
        file,
        "student-uploads",
        content.maxSizeMB || 50,
        undefined,
        allowedExts.length > 0 ? allowedExts : undefined,
        ownerId
      );

      if (!result) return;

      const fileData = {
        storage_path: result.storagePath,
        original_name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        uploaded_at: new Date().toISOString(),
      };

      setUploadedFile(fileData);
      await onSaved?.(fileData);
      toast.success("Файл загружен");
    } catch (err) {
      console.error("[StudentUploadBlock] Upload error:", err);
      toast.error("Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  }, [userId, lessonId, blockId, content.maxSizeMB, allowedExts, onSaved, validateFile]);

  const handleDelete = useCallback(async () => {
    if (!uploadedFile?.storage_path) return;
    try {
      await deleteTrainingAssets(
        [uploadedFile.storage_path],
        { type: "lesson", id: lessonId! },
        "student_file_delete"
      );
      setUploadedFile(null);
      await onSaved?.(null);
      toast.success("Файл удалён");
    } catch (err) {
      console.error("[StudentUploadBlock] Delete error:", err);
    }
  }, [uploadedFile, lessonId, onSaved]);

  const handleReplace = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedFile?.storage_path) {
      await deleteTrainingAssets(
        [uploadedFile.storage_path],
        { type: "lesson", id: lessonId! },
        "student_file_replace"
      );
    }
    await handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadedFile, lessonId, handleUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  // STOP-guard (after all hooks)
  if (!blockId || !lessonId || !userId) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-4 text-center text-muted-foreground">
          Блок загрузки недоступен (нет контекста)
        </CardContent>
      </Card>
    );
  }

  const fileIcon = uploadedFile ? getFileTypeIcon(uploadedFile.original_name || uploadedFile.mime) : null;

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">{content.title || "Загрузите файл"}</p>
            {content.instructions && (
              <p className="text-sm text-muted-foreground">{content.instructions}</p>
            )}
          </div>
        </div>

        {!uploadedFile ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Загрузка...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Перетащите файл или нажмите для выбора
                </p>
                <p className="text-xs text-muted-foreground">
                  Макс. {content.maxSizeMB || 50} МБ
                  {allowedExts.length > 0 && ` • ${allowedExts.join(", ")}`}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            {fileIcon && <fileIcon.Icon className={`h-8 w-8 shrink-0 ${fileIcon.colorClass}`} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{uploadedFile.original_name}</p>
              <p className="text-xs text-muted-foreground">
                {uploadedFile.size ? formatFileSize(uploadedFile.size) : ""}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={handleReplace} title="Заменить">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDelete} title="Удалить" className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={allowedExts.length > 0 ? allowedExts.join(",") : undefined}
          onChange={handleFileChange}
        />

        {content.required && !uploadedFile && (
          <p className="text-xs text-destructive">* Обязательное поле</p>
        )}
      </CardContent>
    </Card>
  );
}
