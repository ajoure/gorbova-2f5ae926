import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mic, Square, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_VOICE_BYTES = 50 * 1024 * 1024; // match ticket-attachments bucket limit
const MAX_DURATION_SEC = 300; // 5 min

interface VoiceRecorderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (file: File) => void;
}

type RecState = "idle" | "recording" | "preview";

function extFromMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

export function VoiceRecorder({ open, onOpenChange, onRecorded }: VoiceRecorderProps) {
  const { toast } = useToast();
  const [state, setState] = useState<RecState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mrRef.current = null;
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      cleanup();
      setState("idle");
      setSeconds(0);
      setBlob(null);
      chunksRef.current = [];
    }
  }, [open, cleanup]);

  // Check support before opening
  useEffect(() => {
    if (open && state === "idle") {
      if (typeof MediaRecorder === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
        toast({
          title: "Запись не поддерживается",
          description: "Ваш браузер не поддерживает запись аудио",
          variant: "destructive",
        });
        onOpenChange(false);
      }
    }
  }, [open, state, toast, onOpenChange]);

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      setBlob(null);
      setSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick best supported mime
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ];
      const mime = candidates.find((c) =>
        typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)
      );

      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mrRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const actualMime = mr.mimeType || "";
        const b = actualMime
          ? new Blob(chunksRef.current, { type: actualMime })
          : new Blob(chunksRef.current);

        if (b.size > MAX_VOICE_BYTES) {
          toast({
            title: "Запись слишком большая",
            description: `Максимальный размер: ${MAX_VOICE_BYTES / 1024 / 1024} МБ`,
            variant: "destructive",
          });
          setState("idle");
          return;
        }
        if (b.size < 100) {
          toast({
            title: "Пустая запись",
            description: "Не удалось записать аудио. Попробуйте снова.",
            variant: "destructive",
          });
          setState("idle");
          return;
        }
        setBlob(b);
        setState("preview");
      };

      mr.start(1000);
      setState("recording");

      const start = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - start) / 1000);
        setSeconds(s);
        if (s >= MAX_DURATION_SEC) {
          mr.state === "recording" && mr.stop();
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 250);
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Нет доступа к микрофону. Разрешите в настройках."
          : "Не удалось начать запись";
      toast({ title: msg, variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const mr = mrRef.current;
    if (mr && mr.state === "recording") {
      mr.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleSend = useCallback(() => {
    if (!blob) return;
    const mime = blob.type || "audio/webm";
    const ext = extFromMime(mime);
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
    onRecorded(file);
    onOpenChange(false);
  }, [blob, onRecorded, onOpenChange]);

  const handleRetry = useCallback(() => {
    setBlob(null);
    setState("idle");
    setSeconds(0);
  }, []);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Запись голосового</DialogTitle>
          <DialogDescription>
            До {MAX_DURATION_SEC / 60} минут. Нажмите «Начать» для записи.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Timer */}
          <div className="text-2xl font-mono tabular-nums">
            {state === "recording" && (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                {formatTime(seconds)}
              </span>
            )}
            {state === "preview" && <span>{formatTime(seconds)}</span>}
          </div>

          {/* Audio preview */}
          {state === "preview" && blob && (
            <audio controls src={URL.createObjectURL(blob)} className="w-full max-w-[280px]" />
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {state === "idle" && (
              <Button onClick={startRecording} className="gap-2">
                <Mic className="h-4 w-4" />
                Начать запись
              </Button>
            )}
            {state === "recording" && (
              <Button onClick={stopRecording} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Остановить
              </Button>
            )}
            {state === "preview" && (
              <>
                <Button onClick={handleRetry} variant="outline">
                  Заново
                </Button>
                <Button onClick={handleSend} className="gap-2">
                  <Send className="h-4 w-4" />
                  Отправить
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
