/**
 * Secure Excel Parser using ExcelJS (Lazy Loaded)
 * 
 * Replaces the vulnerable xlsx (SheetJS) package with ExcelJS to fix:
 * - GHSA-4r6h-8v6p-xvw6 (Prototype Pollution)
 * - GHSA-5pgg-2g8v-p4x9 (ReDoS)
 * 
 * ExcelJS is dynamically imported to reduce initial bundle size on mobile.
 * Note: Legacy .xls format is NOT supported - users must re-save as .xlsx
 */

// Type-only import for TypeScript - no runtime overhead
import type ExcelJS from 'exceljs';

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, ParsedSheet>;
}

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rawRows: unknown[][];
}

export interface ExcelParseOptions {
  /**
   * If true, returns raw arrays instead of objects with headers as keys
   */
  raw?: boolean;
  /**
   * Sheet name or index to parse. If not specified, parses all sheets.
   */
  sheet?: string | number;
  /**
   * Row index (1-based) where headers are located. Default is 1.
   */
  headerRow?: number;
}

/**
 * Dynamically load ExcelJS module
 */
async function getExcelJS(): Promise<typeof ExcelJS> {
  const module = await import('exceljs');
  return module.default;
}

/**
 * Check if file is a supported Excel format
 */
export function isSupportedExcelFormat(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.csv');
}

/**
 * Check if file is legacy .xls format (not supported)
 */
export function isLegacyExcelFormat(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx');
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = false;
      }
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Parse an Excel file (.xlsx) or CSV file
 * 
 * @param file - File object to parse
 * @param options - Parse options
 * @returns Parsed workbook with sheets and data
 * @throws Error if file format is not supported
 */
export async function parseExcelFile(
  file: File,
  options: ExcelParseOptions = {}
): Promise<ParsedWorkbook> {
  const { headerRow = 1 } = options;

  // Check for legacy .xls format
  if (isLegacyExcelFormat(file)) {
    throw new Error(
      'Формат .xls не поддерживается. Пожалуйста, сохраните файл в формате .xlsx и загрузите снова.'
    );
  }

  // Lazy load ExcelJS
  const ExcelJS = await getExcelJS();
  
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  // Determine file type and load accordingly
  if (file.name.toLowerCase().endsWith('.csv')) {
    // For CSV, we need to convert buffer to a readable stream
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split(/\r?\n/);
    const worksheet = workbook.addWorksheet('Sheet1');
    
    for (const line of lines) {
      if (line.trim()) {
        // Simple CSV parsing - handle quoted values
        const values = parseCSVLine(line);
        worksheet.addRow(values);
      }
    }
  } else {
    await workbook.xlsx.load(buffer);
  }

  const result: ParsedWorkbook = {
    sheetNames: workbook.worksheets.map(ws => ws.name),
    sheets: {},
  };

  // Parse each worksheet
  for (const worksheet of workbook.worksheets) {
    const sheetData = parseWorksheet(worksheet, headerRow);
    result.sheets[worksheet.name] = sheetData;
  }

  return result;
}

/**
 * Parse a single worksheet
 */
function parseWorksheet(worksheet: ExcelJS.Worksheet, headerRow: number): ParsedSheet {
  const rawRows: unknown[][] = [];
  const rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = row.values as unknown[];
    // ExcelJS uses 1-based indexing, first element is undefined
    const rowData = values.slice(1).map(cell => getCellValue(cell));
    rawRows.push(rowData);

    if (rowNumber === headerRow) {
      headers = rowData.map(h => String(h ?? '').toLowerCase().trim());
    } else if (rowNumber > headerRow && headers.length > 0) {
      const rowObj: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        if (header) {
          rowObj[header] = rowData[idx];
        }
      });
      rows.push(rowObj);
    }
  });

  return {
    name: worksheet.name,
    headers,
    rows,
    rawRows,
  };
}

/**
 * Extract cell value, handling different ExcelJS cell types
 */
function getCellValue(cell: unknown): unknown {
  if (cell === null || cell === undefined) {
    return null;
  }

  // Handle ExcelJS CellValue object
  if (typeof cell === 'object' && cell !== null) {
    const cellObj = cell as Record<string, unknown>;
    
    // Rich text
    if ('richText' in cellObj && Array.isArray(cellObj.richText)) {
      return (cellObj.richText as Array<{ text: string }>)
        .map(rt => rt.text)
        .join('');
    }
    
    // Hyperlink
    if ('text' in cellObj && 'hyperlink' in cellObj) {
      return cellObj.text;
    }
    
    // Formula result
    if ('result' in cellObj) {
      return cellObj.result;
    }
    
    // Date object
    if (cell instanceof Date) {
      return cell;
    }
    
    // Error value
    if ('error' in cellObj) {
      return null;
    }
  }

  return cell;
}

/**
 * Parse Excel date serial number to JavaScript Date
 * Excel uses different epoch than JavaScript
 */
export function parseExcelSerialDate(serial: number): Date {
  // Excel epoch is December 30, 1899 (due to a historical bug treating 1900 as leap year)
  const excelEpoch = new Date(1899, 11, 30);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  
  return new Date(excelEpoch.getTime() + serial * millisecondsPerDay);
}

/**
 * Create an Excel workbook for export
 */
export async function createExcelWorkbook(
  sheets: Array<{
    name: string;
    headers: string[];
    rows: (string | number | Date | null | undefined)[][];
  }>
): Promise<ExcelJS.Buffer> {
  // Lazy load ExcelJS
  const ExcelJSModule = await getExcelJS();
  const workbook = new ExcelJSModule.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow(sheet.headers);
    
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Download Excel buffer as file
 */
export function downloadExcelBuffer(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Legacy compatibility: Read workbook from array buffer
 * This mimics the old XLSX.read() API for easier migration
 */
export async function readExcel(
  buffer: ArrayBuffer,
  _options?: { type?: string; cellDates?: boolean }
): Promise<{
  SheetNames: string[];
  Sheets: Record<string, {
    headers: string[];
    rows: Record<string, unknown>[];
    rawRows: unknown[][];
  }>;
}> {
  // Lazy load ExcelJS
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const result: {
    SheetNames: string[];
    Sheets: Record<string, {
      headers: string[];
      rows: Record<string, unknown>[];
      rawRows: unknown[][];
    }>;
  } = {
    SheetNames: workbook.worksheets.map(ws => ws.name),
    Sheets: {},
  };

  for (const worksheet of workbook.worksheets) {
    const sheetData = parseWorksheet(worksheet, 1);
    result.Sheets[worksheet.name] = {
      headers: sheetData.headers,
      rows: sheetData.rows,
      rawRows: sheetData.rawRows,
    };
  }

  return result;
}

/**
 * Legacy compatibility: Convert sheet to JSON (like XLSX.utils.sheet_to_json)
 */
export function sheetToJson<T = Record<string, unknown>>(
  sheet: { rows: Record<string, unknown>[]; rawRows: unknown[][] },
  options?: { header?: 1 | 'A' }
): T[] {
  if (options?.header === 1) {
    return sheet.rawRows as T[];
  }
  return sheet.rows as T[];
}
