import ExcelJS from "exceljs";
import { DomainError } from "@/lib/domain/errors";
import { parseMapperCsv, parseMapperTable, type MapperOrderDraft } from "@/lib/services/mapper-sheet";

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text;
    if ("result" in value) return cellText((value as { result: unknown }).result);
    if ("richText" in value && Array.isArray((value as { richText: { text?: string }[] }).richText)) {
      return (value as { richText: { text?: string }[] }).richText.map((part) => part.text ?? "").join("");
    }
  }
  return value == null ? "" : String(value);
}

/** Парсит CSV или Excel (mapper) в браузере и на сервере. */
export async function parseMapperFile(file: File | Blob, fileName?: string): Promise<MapperOrderDraft> {
  const name = (fileName ?? (file instanceof File ? file.name : "upload")).toLowerCase();
  const buffer = await file.arrayBuffer();
  if (name.endsWith(".csv") || (file.type && file.type.includes("csv"))) {
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseMapperCsv(text);
  }
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    throw new DomainError("Нужен файл CSV или Excel (.xlsx)");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new DomainError("В книге нет листа");
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values : [];
    rows.push(values.slice(1).map((cell) => cellText(cell)));
  });
  return parseMapperTable(rows);
}
