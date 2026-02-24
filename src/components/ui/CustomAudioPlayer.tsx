import { useState, useRef, useEffect, useCallback } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomAudioPlayerProps {
  src: string;
  onError?: () => void;
  className?: string;
}

// Simple hash for localStorage key
function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return "audio-pos-" + Math.abs(h).toString(36);
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [1, 1.25, 1.5, 2] as const;

export function CustomAudioPlayer({ src, onError, className }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [seeking, setSeeking] = useState(false);

  const storageKey = hashUrl(src);

  // Restore position on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const pos = parseFloat(saved);
      if (isFinite(pos) && pos > 0 && audioRef.current) {
        audioRef.current.currentTime = pos;
        setCurrentTime(pos);
      }
    }
  }, [storageKey]);

  // Save position every 2s while playing
  useEffect(() => {
    if (playing) {
      saveIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          localStorage.setItem(storageKey, String(audioRef.current.currentTime));
        }
      }, 2000);
    } else {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      // Save on pause too
      if (audioRef.current && audioRef.current.currentTime > 0) {
        localStorage.setItem(storageKey, String(audioRef.current.currentTime));
      }
    }
    return () => {
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [playing, storageKey]);

  const handleTimeUpdate = useCallback(() => {
    if (!seeking && audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [seeking]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      // Re-apply saved position after metadata loaded
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const pos = parseFloat(saved);
        if (isFinite(pos) && pos > 0 && pos < audioRef.current.duration) {
          audioRef.current.currentTime = pos;
          setCurrentTime(pos);
        }
      }
    }
  }, [storageKey]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    setCurrentTime(0);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  const handleSeek = useCallback((value: number[]) => {
    const t = value[0];
    setCurrentTime(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
    setSeeking(false);
  }, []);

  const handleSeekStart = useCallback(() => {
    setSeeking(true);
  }, []);

  const handleSeekMove = useCallback((value: number[]) => {
    setCurrentTime(value[0]);
  }, []);

  const cycleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[next];
    }
  }, [speedIdx]);

  // Sync play state on visibility change (phone unlock)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && audioRef.current) {
        setPlaying(!audioRef.current.paused);
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-card p-3", className)}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={() => onError?.()}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      {/* Play/Pause button — 44x44 touch target */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
      </button>

      {/* Middle section: slider + time */}
      <div className="flex flex-1 flex-col gap-1.5 min-w-0">
        {/* Large slider */}
        <SliderPrimitive.Root
          className="relative flex w-full touch-none select-none items-center py-1"
          value={[currentTime]}
          max={duration || 1}
          step={0.5}
          onValueChange={handleSeekMove}
          onValueCommit={handleSeek}
          onPointerDown={handleSeekStart}
        >
          <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-6 w-6 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        </SliderPrimitive.Root>

        {/* Time display */}
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums px-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Speed button */}
      <button
        type="button"
        onClick={cycleSpeed}
        className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors min-w-[3rem] text-center"
        aria-label="Скорость воспроизведения"
      >
        {SPEEDS[speedIdx]}x
      </button>
    </div>
  );
}
