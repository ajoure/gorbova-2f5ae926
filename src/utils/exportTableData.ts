import { saveAs } from "file-saver";
import Papa from "papaparse";
import { assertExcelAllowedOrThrow } from "@/lib/iosPreviewHardStops";

export interface ExportColumn<T> {
  header: string;
  getValue: (row: T) => string | number | null | undefined;
}

/**
 * Convert data rows to a plain 2D array (header + values).
 */
function toRows<T>(data: T[], columns: ExportColumn<T>[]): (string | number)[][] {
  const header = columns.map(c => c.header);
  const rows = data.map(row =>
    columns.map(c => {
      const v = c.getValue(row);
      return v == null ? "" : v;
    })
  );
  return [header, ...rows];
}

/**
 * Export data to Excel (.xlsx) file.
 * Uses dynamic import to keep xlsx out of main bundle.
 */
export async function exportToExcel<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): Promise<void> {
  assertExcelAllowedOrThrow();

  const XLSX = await import("xlsx");
  const rows = toRows(data, columns);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-width columns based on content
  ws["!cols"] = columns.map((col, i) => {
    let maxLen = col.header.length;
    data.forEach(row => {
      const v = col.getValue(row);
      const len = v != null ? String(v).length : 0;
      if (len > maxLen) maxLen = len;
    });
    return { wch: Math.min(maxLen + 2, 60) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Данные");
  XLSX.writeFile(wb, filename);
}

/**
 * Export data to CSV file with UTF-8 BOM for correct Excel display.
 */
export function exportToCSV<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string
): void {
  const rows = data.map(row => {
    const obj: Record<string, string | number> = {};
    columns.forEach(c => {
      const v = c.getValue(row);
      obj[c.header] = v == null ? "" : v;
    });
    return obj;
  });

  const csv = Papa.unparse(rows, {
    columns: columns.map(c => c.header),
    delimiter: ";",
  });

  // UTF-8 BOM for Excel compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, filename);
}
