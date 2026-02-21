import { useState, useRef, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Trash2, Loader2, Plus, MessageSquare } from "lucide-react";
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
  maxFiles?: number;
  maxTotalSizeMB?: number;
}

interface UploadedFileData {
  storage_path: string;
  original_name: string;
  size: number;
  mime: string;
  uploaded_at: string;
  comment?: string;
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

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_TOTAL_SIZE_MB = 200;
const MAX_PARALLEL_UPLOADS = 2;

interface StudentUploadBlockProps {
  content: StudentUploadContentData;
  onChange: (content: StudentUploadContentData) => void;
  isEditing?: boolean;
  blockId?: string;
  lessonId?: string;
  savedResponse?: any;
  onSaved?: (fileData: any) => Promise<void>;
}

/** Normalize saved response to files[] array (backward compat) */
function normalizeFiles(savedResponse: any): UploadedFileData[] {
  if (!savedResponse) return [];
  if (savedResponse.type === "upload") {
    if (Array.isArray(savedResponse.files)) return savedResponse.files;
    if (savedResponse.file) return [savedResponse.file];
  }
  if (savedResponse.storage_path) return [savedResponse];
  return [];
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
          <Label>Максимальный размер одного файла: {content.maxSizeMB || 50} МБ</Label>
          <Slider
            value={[content.maxSizeMB || 50]}
            onValueChange={([v]) => onChange({ ...content, maxSizeMB: v })}
            min={1}
            max={50}
            step={1}
            className="mt-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Макс. файлов: {content.maxFiles || DEFAULT_MAX_FILES}</Label>
            <Slider
              value={[content.maxFiles || DEFAULT_MAX_FILES]}
              onValueChange={([v]) => onChange({ ...content, maxFiles: v })}
              min={1}
              max={20}
              step={1}
              className="mt-2"
            />
          </div>
          <div>
            <Label>Макс. общий размер: {content.maxTotalSizeMB || DEFAULT_MAX_TOTAL_SIZE_MB} МБ</Label>
            <Slider
              value={[content.maxTotalSizeMB || DEFAULT_MAX_TOTAL_SIZE_MB]}
              onValueChange={([v]) => onChange({ ...content, maxTotalSizeMB: v })}
              min={10}
              max={500}
              step={10}
              className="mt-2"
            />
          </div>
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
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileData[]>(() => normalizeFiles(savedResponse));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [commentingIdx, setCommentingIdx] = useState<number | null>(null);

  const userId = user?.id;
  const maxFiles = content.maxFiles || DEFAULT_MAX_FILES;
  const maxTotalSizeMB = content.maxTotalSizeMB || DEFAULT_MAX_TOTAL_SIZE_MB;

  const allowedExts = useMemo(
    () => (content.allowedGroups || []).flatMap((g) => GROUP_EXTENSIONS[g] || []),
    [content.allowedGroups]
  );

  const currentTotalSize = useMemo(
    () => uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    [uploadedFiles]
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

  const isDuplicate = useCallback((file: File): boolean => {
    return uploadedFiles.some(
      (f) => f.original_name === file.name && f.size === file.size
    );
  }, [uploadedFiles]);

  const saveFiles = useCallback(async (files: UploadedFileData[]) => {
    if (files.length === 0) {
      await onSaved?.(null);
    } else {
      await onSaved?.({ type: "upload", files });
    }
  }, [onSaved]);

  const handleUploadFiles = useCallback(async (fileList: File[]) => {
    if (!userId || !lessonId || !blockId) return;

    // Filter & validate
    const validFiles: File[] = [];
    let pendingCount = uploadedFiles.length;
    let pendingSize = currentTotalSize;

    for (const file of fileList) {
      if (pendingCount >= maxFiles) {
        toast.error(`Максимум ${maxFiles} файлов`);
        break;
      }
      if (pendingSize + file.size > maxTotalSizeMB * 1024 * 1024) {
        toast.error(`Превышен общий лимит ${maxTotalSizeMB} МБ`);
        break;
      }
      if (isDuplicate(file)) {
        toast.error(`Файл "${file.name}" уже загружен`);
        continue;
      }
      if (!validateFile(file)) continue;

      validFiles.push(file);
      pendingCount++;
      pendingSize += file.size;
    }

    if (validFiles.length === 0) return;

    setUploading(true);
    try {
      const ownerId = `${userId}/${lessonId}/${blockId}`;
      const newFiles: UploadedFileData[] = [];

      // Upload with concurrency limit
      for (let i = 0; i < validFiles.length; i += MAX_PARALLEL_UPLOADS) {
        const batch = validFiles.slice(i, i + MAX_PARALLEL_UPLOADS);
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            const result = await uploadToTrainingAssets(
              file, "student-uploads", content.maxSizeMB || 50,
              undefined, allowedExts.length > 0 ? allowedExts : undefined, ownerId
            );
            if (!result) return null;
            return {
              storage_path: result.storagePath,
              original_name: file.name,
              size: file.size,
              mime: file.type || "application/octet-stream",
              uploaded_at: new Date().toISOString(),
            } as UploadedFileData;
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) newFiles.push(r.value);
        }
      }

      if (newFiles.length > 0) {
        const updated = [...uploadedFiles, ...newFiles];
        setUploadedFiles(updated);
        await saveFiles(updated);
        toast.success(`Загружено файлов: ${newFiles.length}`);
      }
    } catch (err) {
      console.error("[StudentUploadBlock] Upload error:", err);
      toast.error("Ошибка загрузки файла");
    } finally {
      setUploading(false);
    }
  }, [userId, lessonId, blockId, content.maxSizeMB, allowedExts, uploadedFiles, currentTotalSize, maxFiles, maxTotalSizeMB, isDuplicate, validateFile, saveFiles]);

  const handleDeleteOne = useCallback(async (idx: number) => {
    const file = uploadedFiles[idx];
    if (!file?.storage_path) return;
    try {
      await deleteTrainingAssets(
        [file.storage_path],
        { type: "lesson", id: lessonId! },
        "student_file_delete"
      );
      const updated = uploadedFiles.filter((_, i) => i !== idx);
      setUploadedFiles(updated);
      await saveFiles(updated);
      toast.success("Файл удалён");
    } catch (err) {
      console.error("[StudentUploadBlock] Delete error:", err);
    }
  }, [uploadedFiles, lessonId, saveFiles]);

  const handleCommentChange = useCallback(async (idx: number, comment: string) => {
    const updated = uploadedFiles.map((f, i) => i === idx ? { ...f, comment } : f);
    setUploadedFiles(updated);
    await saveFiles(updated);
  }, [uploadedFiles, saveFiles]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await handleUploadFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUploadFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleUploadFiles(Array.from(files));
  }, [handleUploadFiles]);

  // STOP-guard
  if (!blockId || !lessonId || !userId) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-4 text-center text-muted-foreground">
          Блок загрузки недоступен (нет контекста)
        </CardContent>
      </Card>
    );
  }

  const canAddMore = uploadedFiles.length < maxFiles;

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

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map((file, idx) => {
              const { Icon, colorClass } = getFileTypeIcon(file.original_name);
              return (
                <div key={file.storage_path} className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-6 w-6 shrink-0 ${colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.original_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size ? formatFileSize(file.size) : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setCommentingIdx(commentingIdx === idx ? null : idx)}
                        title="Комментарий"
                      >
                        <MessageSquare className={`h-4 w-4 ${file.comment ? "text-primary" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => handleDeleteOne(idx)}
                        title="Удалить"
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {commentingIdx === idx && (
                    <Input
                      className="mt-2"
                      placeholder="Добавьте комментарий к файлу..."
                      value={file.comment || ""}
                      onChange={(e) => handleCommentChange(idx, e.target.value)}
                    />
                  )}
                  {commentingIdx !== idx && file.comment && (
                    <p className="text-xs text-muted-foreground mt-1 italic">💬 {file.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Drop zone / add more */}
        {canAddMore && (
          uploadedFiles.length === 0 ? (
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
                    Перетащите файлы или нажмите для выбора
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Макс. {content.maxSizeMB || 50} МБ на файл • до {maxFiles} файлов
                    {allowedExts.length > 0 && ` • ${allowedExts.join(", ")}`}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => !uploading && fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Добавить ещё ({uploadedFiles.length}/{maxFiles})
            </Button>
          )
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={allowedExts.length > 0 ? allowedExts.join(",") : undefined}
          onChange={handleFileChange}
        />

        {content.required && uploadedFiles.length === 0 && (
          <p className="text-xs text-destructive">* Обязательное поле</p>
        )}
      </CardContent>
    </Card>
  );
}
