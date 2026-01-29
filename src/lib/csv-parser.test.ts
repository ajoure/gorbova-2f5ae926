import { describe, it, expect } from "vitest";
import { parseCSVContent } from "./csv-parser";

describe("parseCSVContent", () => {
  it("should parse semicolon-delimited CSV with Russian headers", () => {
    const csvContent = `Дата ответа;Номер выпуска;Номер вопроса;Суть вопроса;Ссылка на видео в кинескопе;Тайминг
22.01.25;74;1;Как закрыть ИП?;https://kinescope.io/abc123;1:14:20
22.01.25;74;2;Налог на УСН;https://kinescope.io/abc123;1:20:30`;

    const result = parseCSVContent(csvContent);
    
    expect(result.headers).toContain("Дата ответа");
    expect(result.headers).toContain("Номер выпуска");
    expect(result.headers).toContain("Суть вопроса");
    expect(result.rows.length).toBe(2);
    expect(result.delimiter).toBe(";");
    expect(result.rows[0]["Номер выпуска"]).toBe("74");
    expect(result.rows[0]["Суть вопроса"]).toBe("Как закрыть ИП?");
  });

  it("should parse comma-delimited CSV", () => {
    const csvContent = `Date,Episode,Title
2025-01-22,74,Test question`;

    const result = parseCSVContent(csvContent);
    
    expect(result.delimiter).toBe(",");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]["Episode"]).toBe("74");
  });

  it("should handle quoted fields with embedded delimiters", () => {
    const csvContent = `Title;Description
"Question with; semicolon";"Answer, with comma"`;

    const result = parseCSVContent(csvContent);
    
    expect(result.rows[0]["Title"]).toBe("Question with; semicolon");
    expect(result.rows[0]["Description"]).toBe("Answer, with comma");
  });

  it("should handle BOM marker", () => {
    const csvWithBom = `\uFEFFTitle;Value
Test;123`;

    const result = parseCSVContent(csvWithBom);
    
    expect(result.headers).toContain("Title");
    expect(result.rows[0]["Title"]).toBe("Test");
  });
});
