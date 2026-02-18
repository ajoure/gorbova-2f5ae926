import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AudioContent } from "@/hooks/useLessonBlocks";
import { Music, ExternalLink, Upload, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { uploadToTrainingAssets, convertGoogleDriveUrl } from "./uploadToTrainingAssets";

interface AudioBlockProps {
  content: AudioContent;
  onChange: (content: AudioContent) => void;
  isEditing?: boolean;
}

export function AudioBlock({ content, onChange, isEditing = true }: AudioBlockProps) {
  const [localUrl, setLocalUrl] = useState(content.url || "");
  const [localTitle, setLocalTitle] = useState(content.title || "");
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Проверяем, является ли URL Google Drive ссылкой
  const { isGoogleDrive } = convertGoogleDriveUrl(localUrl);

  const handleUrlBlur = () => {
    let finalUrl = localUrl;

    // Автоконвертация Google Drive URL при вставке
    const { converted, isGoogleDrive: isGD } = convertGoogleDriveUrl(localUrl);
    if (isGD && converted && converted !== localUrl) {
      finalUrl = converted;
      setLocalUrl(converted);
    }

    onChange({ ...content, url: finalUrl });
  };

  const handleTitleBlur = () => {
    onChange({ ...content, title: localTitle });
  };

  const handleFileUpload = async (file: File) => {
    // Валидация типа
    const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/aac", "audio/x-m4a", "audio/mp3"];
    const isAudio = file.type.startsWith("audio/") || allowedTypes.includes(file.type);
    if (!isAudio) {
      toast.error("Выберите аудиофайл (.mp3, .wav, .m4a, .ogg, .aac)");
      return;
    }

    try {
      setUploading(true);
      const publicUrl = await uploadToTrainingAssets(file, "lesson-audio", 50);
      if (publicUrl) {
        setLocalUrl(publicUrl);
        onChange({ ...content, url: publicUrl });
        toast.success("Аудио загружено");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Сбрасываем input чтобы можно было загрузить тот же файл повторно
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

  // Режим просмотра (для студента)
  if (!isEditing) {
    if (!content.url) {
      return (
        <div className="flex items-center justify-center h-20 bg-muted rounded-lg">
          <Music className="h-8 w-8 text-muted-foreground" />
        </div>
      );
    }

    const { isGoogleDrive: isGD } = convertGoogleDriveUrl(content.url);

    return (
      <div className="space-y-2">
        {content.title && (
          <p className="text-sm font-medium text-muted-foreground">{content.title}</p>
        )}
        {isGD && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Google Drive может не отдавать прямой аудиопоток. Если аудио не воспроизводится — обратитесь к организатору.</span>
          </div>
        )}
        <audio controls className="w-full">
          <source src={content.url} />
          Ваш браузер не поддерживает аудио элемент.
        </audio>
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
          accept=".mp3,.wav,.m4a,.ogg,.aac,audio/*"
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
              <Music className="h-8 w-8 text-muted-foreground" />
              <Button
                variant="outline"
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Загрузить аудио
              </Button>
              <p className="text-xs text-muted-foreground">
                или перетащите файл сюда • .mp3, .wav, .m4a, .ogg, .aac • до 50 МБ
              </p>
            </>
          )}
        </div>
      </div>

      {/* URL поле */}
      <div className="space-y-1.5">
        <Label>Или укажите прямую ссылку на аудио</Label>
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

        {/* Google Drive предупреждение */}
        {isGoogleDrive && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20 text-xs text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Google Drive может не отдавать прямой аудиопоток. URL преобразован в прямую ссылку для скачивания, но воспроизведение не гарантировано. <strong>Рекомендуется загрузить файл через кнопку выше.</strong>
            </span>
          </div>
        )}
      </div>

      {/* Название */}
      <div className="space-y-1.5">
        <Label>Название (опционально)</Label>
        <Input
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Название аудио"
          disabled={uploading}
        />
      </div>

      {/* Превью плеер */}
      {content.url && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Предпросмотр</Label>
          <audio controls className="w-full">
            <source src={content.url} />
          </audio>
        </div>
      )}
    </div>
  );
}
