import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileAudio,
  FileVideo,
  FileArchive,
  File,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export interface FileTypeIconResult {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

interface FileTypeIconOptions {
  colored?: boolean;
}

const NEUTRAL_CLASS = "text-muted-foreground";

interface RawIconDef {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

const EXTENSION_MAP: Record<string, RawIconDef> = {
  ".pdf": { Icon: FileText, colorClass: "text-red-500", label: "PDF" },
  ".doc": { Icon: FileText, colorClass: "text-blue-600", label: "Word" },
  ".docx": { Icon: FileText, colorClass: "text-blue-600", label: "Word" },
  ".odt": { Icon: FileText, colorClass: "text-blue-600", label: "Document" },
  ".rtf": { Icon: FileText, colorClass: "text-blue-600", label: "RTF" },
  ".xls": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Excel" },
  ".xlsx": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Excel" },
  ".ods": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Spreadsheet" },
  ".csv": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "CSV" },
  ".ppt": { Icon: Presentation, colorClass: "text-orange-500", label: "PowerPoint" },
  ".pptx": { Icon: Presentation, colorClass: "text-orange-500", label: "PowerPoint" },
  ".jpg": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".jpeg": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".png": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".gif": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".webp": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".svg": { Icon: FileImage, colorClass: "text-pink-500", label: "SVG" },
  ".heic": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".mp3": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".wav": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".m4a": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".ogg": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".aac": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".mp4": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".mov": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".avi": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".mkv": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".webm": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".zip": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  ".rar": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  ".7z": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  ".txt": { Icon: FileText, colorClass: "text-muted-foreground", label: "Text" },
};

const MIME_PREFIX_MAP: Array<{ prefix: string; result: RawIconDef }> = [
  { prefix: "image/", result: { Icon: FileImage, colorClass: "text-pink-500", label: "Image" } },
  { prefix: "audio/", result: { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" } },
  { prefix: "video/", result: { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" } },
];

const DEFAULT_ICON: RawIconDef = { Icon: File, colorClass: "text-muted-foreground", label: "File" };

/**
 * Returns an icon, color class, and label for a given filename or MIME type.
 * @param opts.colored — if false (default), all icons use neutral text-muted-foreground
 */
export function getFileTypeIcon(
  filenameOrMime?: string | null,
  opts?: FileTypeIconOptions
): FileTypeIconResult {
  const colored = opts?.colored ?? false;

  if (!filenameOrMime) {
    return { ...DEFAULT_ICON, colorClass: colored ? DEFAULT_ICON.colorClass : NEUTRAL_CLASS };
  }

  let found: RawIconDef | null = null;

  // Try extension first
  const dotIdx = filenameOrMime.lastIndexOf(".");
  if (dotIdx > 0 && !filenameOrMime.includes("/")) {
    const ext = filenameOrMime.slice(dotIdx).toLowerCase();
    if (EXTENSION_MAP[ext]) found = EXTENSION_MAP[ext];
  }

  // Fallback: try suffix without dot (e.g. "...-3-__XLS")
  if (!found && !filenameOrMime.includes("/")) {
    const upper = filenameOrMime.toUpperCase();
    const suffixMap: Record<string, string> = {
      "_PDF": ".pdf", "_DOC": ".doc", "_DOCX": ".docx", "_ODT": ".odt", "_RTF": ".rtf",
      "_XLS": ".xls", "_XLSX": ".xlsx", "_ODS": ".ods", "_CSV": ".csv",
      "_PPT": ".ppt", "_PPTX": ".pptx",
      "_JPG": ".jpg", "_JPEG": ".jpeg", "_PNG": ".png", "_GIF": ".gif", "_WEBP": ".webp", "_SVG": ".svg",
      "_MP3": ".mp3", "_WAV": ".wav", "_M4A": ".m4a", "_OGG": ".ogg",
      "_MP4": ".mp4", "_MOV": ".mov", "_AVI": ".avi", "_MKV": ".mkv", "_WEBM": ".webm",
      "_ZIP": ".zip", "_RAR": ".rar", "_7Z": ".7z", "_TXT": ".txt",
    };
    for (const [suffix, ext] of Object.entries(suffixMap)) {
      if (upper.endsWith(suffix)) { found = EXTENSION_MAP[ext] ?? null; break; }
    }
  }

  // Try MIME prefix
  if (!found) {
    const lower = filenameOrMime.toLowerCase();
    for (const { prefix, result } of MIME_PREFIX_MAP) {
      if (lower.startsWith(prefix)) { found = result; break; }
    }
  }

  // Try MIME-based guesses
  if (!found) {
    const lower = filenameOrMime.toLowerCase();
    if (lower.includes("pdf")) found = EXTENSION_MAP[".pdf"];
    else if (lower.includes("word") || lower.includes("document")) found = EXTENSION_MAP[".docx"];
    else if (lower.includes("spreadsheet") || lower.includes("excel")) found = EXTENSION_MAP[".xlsx"];
    else if (lower.includes("presentation") || lower.includes("powerpoint")) found = EXTENSION_MAP[".pptx"];
  }

  if (!found) found = DEFAULT_ICON;

  return {
    Icon: found.Icon,
    colorClass: colored ? found.colorClass : NEUTRAL_CLASS,
    label: found.label,
  };
}
