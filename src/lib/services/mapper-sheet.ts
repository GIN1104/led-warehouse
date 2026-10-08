import { addDays, todayIso } from "@/lib/dates";

export type MapperLine = { code: string; qty: number };

export type MapperOrderDraft = {
  externalId?: string;
  customerName: string;
  startDate: string;
  endDate: string;
  notes?: string;
  lines: MapperLine[];
};

const HEADER: Record<string, "code" | "qty" | "customer" | "start" | "end" | "external" | "notes"> = {
  code: "code",
  sku: "code",
  sku_code: "code",
  артикул: "code",
  код: "code",
  qty: "qty",
  quantity: "qty",
  количество: "qty",
  "кол-во": "qty",
  колво: "qty",
  customer: "customer",
  customer_name: "customer",
  заказчик: "customer",
  start: "start",
  start_date: "start",
  начало: "start",
  end: "end",
  end_date: "end",
  окончание: "end",
  external_id: "external",
  order_id: "external",
  номер: "external",
  notes: "notes",
  заметка: "notes",
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeDate(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
  if (local) {
    const day = local[1] ?? "";
    const month = local[2] ?? "";
    const year = local[3] ?? "";
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return trimmed;
}

/** Таблица с заголовком: код, количество и поля заказа. Повтор кода суммируется. */
export function parseMapperTable(rows: string[][]): MapperOrderDraft {
  const table = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  const header = table[0];
  if (!header) throw new Error("В таблице нет строк");
  const columns = header.map((cell) => HEADER[normalizeHeader(cell)]);
  if (!columns.includes("code") || !columns.includes("qty")) {
    throw new Error("Нужны столбцы code и qty");
  }
  const today = todayIso();
  let customerName = "";
  let startDate = "";
  let endDate = "";
  let externalId = "";
  let notes = "";
  const qtyByCode = new Map<string, number>();

  for (const row of table.slice(1)) {
    const record: Partial<Record<(typeof columns)[number], string>> = {};
    columns.forEach((column, index) => {
      if (!column) return;
      record[column] = row[index]?.trim() ?? "";
    });
    if (record.customer) customerName = record.customer;
    if (record.start) startDate = record.start;
    if (record.end) endDate = record.end;
    if (record.external) externalId = record.external;
    if (record.notes) notes = record.notes;
    const code = (record.code ?? "").trim().toUpperCase();
    if (!code) continue;
    const qty = Number(String(record.qty ?? "").replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Некорректное количество для ${code}`);
    qtyByCode.set(code, (qtyByCode.get(code) ?? 0) + qty);
  }

  const start = normalizeDate(startDate, today);
  const draft: MapperOrderDraft = {
    customerName,
    startDate: start,
    endDate: normalizeDate(endDate, addDays(start, 2)),
    notes,
    lines: [...qtyByCode.entries()].map(([code, qty]) => ({ code, qty })),
  };
  if (externalId) draft.externalId = externalId;
  return draft;
}

export function parseMapperCsv(text: string): MapperOrderDraft {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => splitCsvLine(line));
  return parseMapperTable(rows);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
