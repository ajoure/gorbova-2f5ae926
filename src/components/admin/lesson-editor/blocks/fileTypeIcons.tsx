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

interface FileTypeIconResult {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

const EXTENSION_MAP: Record<string, FileTypeIconResult> = {
  // PDF
  ".pdf": { Icon: FileText, colorClass: "text-red-500", label: "PDF" },
  // Word
  ".doc": { Icon: FileText, colorClass: "text-blue-600", label: "Word" },
  ".docx": { Icon: FileText, colorClass: "text-blue-600", label: "Word" },
  ".odt": { Icon: FileText, colorClass: "text-blue-600", label: "Document" },
  ".rtf": { Icon: FileText, colorClass: "text-blue-600", label: "RTF" },
  // Excel / Spreadsheets
  ".xls": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Excel" },
  ".xlsx": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Excel" },
  ".ods": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "Spreadsheet" },
  ".csv": { Icon: FileSpreadsheet, colorClass: "text-green-600", label: "CSV" },
  // PowerPoint
  ".ppt": { Icon: Presentation, colorClass: "text-orange-500", label: "PowerPoint" },
  ".pptx": { Icon: Presentation, colorClass: "text-orange-500", label: "PowerPoint" },
  // Images
  ".jpg": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".jpeg": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".png": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".gif": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".webp": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  ".svg": { Icon: FileImage, colorClass: "text-pink-500", label: "SVG" },
  ".heic": { Icon: FileImage, colorClass: "text-pink-500", label: "Image" },
  // Audio
  ".mp3": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".wav": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".m4a": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".ogg": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  ".aac": { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" },
  // Video
  ".mp4": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".mov": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".avi": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".mkv": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  ".webm": { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" },
  // Archives
  ".zip": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  ".rar": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  ".7z": { Icon: FileArchive, colorClass: "text-amber-600", label: "Archive" },
  // Text
  ".txt": { Icon: FileText, colorClass: "text-muted-foreground", label: "Text" },
};

const MIME_PREFIX_MAP: Array<{ prefix: string; result: FileTypeIconResult }> = [
  { prefix: "image/", result: { Icon: FileImage, colorClass: "text-pink-500", label: "Image" } },
  { prefix: "audio/", result: { Icon: FileAudio, colorClass: "text-purple-500", label: "Audio" } },
  { prefix: "video/", result: { Icon: FileVideo, colorClass: "text-fuchsia-500", label: "Video" } },
];

const DEFAULT_ICON: FileTypeIconResult = { Icon: File, colorClass: "text-muted-foreground", label: "File" };

/**
 * Returns an icon, color class, and label for a given filename or MIME type.
 */
export function getFileTypeIcon(filenameOrMime?: string | null): FileTypeIconResult {
  if (!filenameOrMime) return DEFAULT_ICON;

  // Try extension first
  const dotIdx = filenameOrMime.lastIndexOf(".");
  if (dotIdx > 0 && !filenameOrMime.includes("/")) {
    const ext = filenameOrMime.slice(dotIdx).toLowerCase();
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  // Try MIME prefix
  const lower = filenameOrMime.toLowerCase();
  for (const { prefix, result } of MIME_PREFIX_MAP) {
    if (lower.startsWith(prefix)) return result;
  }

  // Try MIME-based extension guesses
  if (lower.includes("pdf")) return EXTENSION_MAP[".pdf"];
  if (lower.includes("word") || lower.includes("document")) return EXTENSION_MAP[".docx"];
  if (lower.includes("spreadsheet") || lower.includes("excel")) return EXTENSION_MAP[".xlsx"];
  if (lower.includes("presentation") || lower.includes("powerpoint")) return EXTENSION_MAP[".pptx"];

  return DEFAULT_ICON;
}
