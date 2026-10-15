import { addDays, todayIso } from "@/lib/dates";
import { canonicalizeEquipmentName } from "@/lib/domain/he-ru-glossary";
import { normalizeEquipmentName } from "@/lib/domain/sku-code";

export type MapperLine = { code?: string; name?: string; category?: string; qty: number };

export type MapperOrderDraft = {
  externalId?: string;
  customerName: string;
  startDate: string;
  endDate: string;
  notes?: string;
  lines: MapperLine[];
};

export type MapperColumn =
  | "code"
  | "name"
  | "qty"
  | "customer"
  | "start"
  | "end"
  | "external"
  | "notes"
  | "category";

/** Алиасы заголовков → поле. Ключи уже в нормализованном виде (см. normalizeHeader). */
export const HEADER_ALIASES: Record<string, MapperColumn> = {
  // code
  code: "code",
  sku: "code",
  sku_code: "code",
  article: "code",
  артикул: "code",
  код: "code",
  קוד: "code",
  מק_ט: "code",
  מקט: "code",
  // name
  name: "name",
  title: "name",
  item: "name",
  items: "name",
  equipment: "name",
  description: "name",
  desc: "name",
  product: "name",
  product_name: "name",
  название: "name",
  наименование: "name",
  оборудование: "name",
  товар: "name",
  позиция: "name",
  имя: "name",
  שם: "name",
  פריט: "name",
  תיאור: "name",
  ציוד: "name",
  מוצר: "name",
  // qty
  qty: "qty",
  quantity: "qty",
  amount: "qty",
  count: "qty",
  pcs: "qty",
  units: "qty",
  количество: "qty",
  кол_во: "qty",
  колво: "qty",
  колич: "qty",
  шт: "qty",
  כמות: "qty",
  כמות_יח: "qty",
  כמות_יחידות: "qty",
  מספר: "qty",
  // customer
  customer: "customer",
  customer_name: "customer",
  client: "customer",
  заказчик: "customer",
  клиент: "customer",
  לקוח: "customer",
  // start / end
  start: "start",
  start_date: "start",
  from: "start",
  начало: "start",
  дата_начала: "start",
  end: "end",
  end_date: "end",
  to: "end",
  until: "end",
  окончание: "end",
  дата_окончания: "end",
  // external
  external_id: "external",
  order_id: "external",
  order: "external",
  id: "external",
  номер: "external",
  // notes
  notes: "notes",
  note: "notes",
  comment: "notes",
  комментарий: "notes",
  заметка: "notes",
  // category
  category: "category",
  family: "category",
  group: "category",
  группа: "category",
  категория: "category",
  семейство: "category",
  קטגוריה: "category",
  קבוצה: "category",
};

/** Человекочитаемый список принимаемых алиасов по полям (для ошибок и docs). */
export const ACCEPTED_HEADER_EXAMPLES: Record<"name" | "qty" | "code" | "category", string[]> = {
  name: [
    "name",
    "название",
    "наименование",
    "оборудование",
    "item",
    "description",
    "equipment",
    "שם",
    "פריט",
    "תיאור",
  ],
  qty: ["qty", "quantity", "количество", "кол-во", "QTY", "כמות", "כמות יח׳"],
  code: ["code", "sku", "артикул", "код", "קוד", "מק״ט"],
  category: ["category", "группа", "категория", "family", "group", "קטגוריה"],
};

/**
 * Нормализация заголовка: trim, lower, NBSP→space, дефисы/слэши/точки → `_`,
 * схлопывание разделителей. Case-insensitive для латиницы/кириллицы.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFC")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[''`׳״"]/g, "")
    .replace(/[.\u2024]/g, "")
    .replace(/[_‐‑‒–—−\-/\\|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function resolveHeaderColumn(raw: string): MapperColumn | undefined {
  return HEADER_ALIASES[normalizeHeader(raw)];
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

type LineBucket = { code?: string; name?: string; category?: string; qty: number };

function rowHasContent(row: string[]): boolean {
  return row.some((cell) => cell.trim() !== "");
}

function parseQtyCell(value: string): number {
  return Number(String(value ?? "").replace(",", ".").replace(/\s+/g, ""));
}

function looksLikeQty(value: string): boolean {
  const qty = parseQtyCell(value);
  return Number.isFinite(qty) && qty > 0;
}

/** Первая строка похожа на заголовок, если хотя бы одна ячейка — известный алиас. */
export function rowLooksLikeHeader(row: string[]): boolean {
  return row.some((cell) => cell.trim() !== "" && resolveHeaderColumn(cell) !== undefined);
}

/**
 * Fallback: две колонки name,qty без строки заголовков.
 * Условие: нет известных заголовков, ≥1 строка данных, 2-я колонка — число > 0.
 */
function tryParseHeaderlessNameQty(table: string[][]): MapperOrderDraft | null {
  if (table.length === 0) return null;
  if (rowLooksLikeHeader(table[0]!)) return null;

  const width = Math.max(...table.map((row) => row.length));
  if (width < 2 || width > 3) return null;

  const dataRows = table.filter((row) => {
    const name = (row[0] ?? "").trim();
    const qtyRaw = (row[1] ?? "").trim();
    if (!name && !qtyRaw) return false;
    return name !== "" && looksLikeQty(qtyRaw);
  });
  if (dataRows.length === 0) return null;
  // Большинство непустых строк должны быть name+qty
  const nonEmpty = table.filter(rowHasContent);
  if (dataRows.length < Math.ceil(nonEmpty.length * 0.6)) return null;

  const today = todayIso();
  const buckets = new Map<string, LineBucket>();
  for (const row of dataRows) {
    const name = canonicalizeEquipmentName((row[0] ?? "").trim());
    const qty = parseQtyCell(row[1] ?? "");
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;
    const key = `n:${normalizeEquipmentName(name)}`;
    const prev = buckets.get(key);
    if (prev) prev.qty += qty;
    else buckets.set(key, { name, qty });
  }
  if (buckets.size === 0) return null;
  return {
    customerName: "",
    startDate: today,
    endDate: addDays(today, 2),
    notes: "",
    lines: [...buckets.values()],
  };
}

function formatColumnError(seenHeaders: string[]): Error {
  const seen = seenHeaders.map((h) => (h.trim() === "" ? "(пусто)" : `"${h.trim()}"`)).join(", ");
  const accepted = (
    ["name", "qty", "code", "category"] as const
  )
    .map((field) => `${field}: ${ACCEPTED_HEADER_EXAMPLES[field].join(", ")}`)
    .join("; ");
  return new Error(
    `Не удалось сопоставить столбцы. В файле заголовки: [${seen || "нет"}]. ` +
      `Нужны qty и (code или name/название). Принимаются: ${accepted}. ` +
      `Либо файл из 2 колонок name,qty без строки заголовков.`,
  );
}

/** Таблица с заголовком: code и/или name + qty. Повтор одной позиции суммируется. */
export function parseMapperTable(rows: string[][]): MapperOrderDraft {
  const table = rows.filter(rowHasContent);
  if (table.length === 0) throw new Error("В таблице нет строк");

  const headerless = tryParseHeaderlessNameQty(table);
  if (headerless) return headerless;

  const header = table[0]!;
  const columns = header.map((cell) => resolveHeaderColumn(cell));
  const hasCode = columns.includes("code");
  const hasName = columns.includes("name");
  const hasQty = columns.includes("qty");

  if (!hasQty || (!hasCode && !hasName)) {
    // Если первая строка не заголовки — попробуем подсказать яснее
    if (!rowLooksLikeHeader(header)) {
      throw formatColumnError(header);
    }
    throw formatColumnError(header);
  }

  const today = todayIso();
  let customerName = "";
  let startDate = "";
  let endDate = "";
  let externalId = "";
  let notes = "";
  const buckets = new Map<string, LineBucket>();

  for (const row of table.slice(1)) {
    const record: Partial<Record<MapperColumn, string>> = {};
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
    const rawName = (record.name ?? "").trim();
    const name = rawName ? canonicalizeEquipmentName(rawName) : "";
    const category = (record.category ?? "").trim();
    if (!code && !name) continue;
    const qty = parseQtyCell(record.qty ?? "");
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Некорректное количество для ${name || code}`);
    }
    const key = name ? `n:${normalizeEquipmentName(name)}` : `c:${code}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.qty += qty;
      if (category && !prev.category) prev.category = category;
      if (code && !prev.code) prev.code = code;
      if (name && !prev.name) prev.name = name;
    } else {
      buckets.set(key, {
        qty,
        ...(code ? { code } : {}),
        ...(name ? { name } : {}),
        ...(category ? { category } : {}),
      });
    }
  }

  const start = normalizeDate(startDate, today);
  const draft: MapperOrderDraft = {
    customerName,
    startDate: start,
    endDate: normalizeDate(endDate, addDays(start, 2)),
    notes,
    lines: [...buckets.values()],
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
