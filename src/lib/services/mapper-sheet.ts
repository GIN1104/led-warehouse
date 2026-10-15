import { addDays, todayIso } from "@/lib/dates";
import { canonicalizeEquipmentName, isGlossaryEquipmentName } from "@/lib/domain/he-ru-glossary";
import { normalizeEquipmentName } from "@/lib/domain/sku-code";

export type MapperLine = {
  code?: string;
  name?: string;
  category?: string;
  qty: number;
  /** Заметка по строке (колонка D / хвост qty-ячейки). */
  note?: string;
};

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

/** Сколько первых строк сканировать в поисках заголовка / данных. */
export const HEADER_SCAN_ROWS = 30;

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
  כמויות: "qty",
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
  תופסות: "notes",
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
    "Оборудование",
    "item",
    "description",
    "equipment",
    "ציוד",
    "שם",
    "פריט",
    "תיאור",
  ],
  qty: ["qty", "quantity", "количество", "кол-во", "QTY", "כמות", "כמויות", "כמות יח׳"],
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

type LineBucket = {
  code?: string;
  name?: string;
  category?: string;
  qty: number;
  note?: string;
};

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

/** Префиксы строк-метаданных mapper Excel (дата, событие, локация…). */
const META_ROW_PREFIXES = [
  /^תאריך\s*:/i,
  /^date\s*:/i,
  /^שם\s*האירוע\s*:/i,
  /^event\s*:/i,
  /^מיקום\s*:/i,
  /^location\s*:/i,
  /^שעות\s*:/i,
  /^hours?\s*:/i,
  /^איש\s*קשר\s*:/i,
  /^contact\s*:/i,
  /^רכב\s*:/i,
  /^vehicle\s*:/i,
  /^סוג\s*:/i,
  /^type\s*:/i,
];

/** Первая строка похожа на заголовок, если хотя бы одна ячейка — известный алиас. */
export function rowLooksLikeHeader(row: string[]): boolean {
  return row.some((cell) => cell.trim() !== "" && resolveHeaderColumn(cell) !== undefined);
}

/**
 * Строка-метаданные / merged title: одна «метка: значение» без таблицы,
 * либо известный префикс (תאריך:, Date:, שם האירוע: …).
 */
export function isMetadataRow(row: string[]): boolean {
  const cells = row.map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) return true;
  const joined = cells.join(" ");
  if (META_ROW_PREFIXES.some((re) => re.test(joined))) return true;
  // Одна непустая ячейка вида «метка: значение» без известных заголовков
  if (cells.length === 1 && /^.+:\s*.+/.test(cells[0]!) && !rowLooksLikeHeader(row)) {
    return true;
  }
  return false;
}

/** Извлечь дату из ячейки `תאריך: DD.MM.YYYY` / `Date: …`. */
export function extractMetaDate(row: string[]): string | undefined {
  const text = row
    .map((c) => c.trim())
    .filter(Boolean)
    .join(" ");
  const m = /(?:תאריך|date)\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i.exec(text);
  if (!m?.[1]) return undefined;
  return normalizeDate(m[1], "");
}

/** Извлечь название события из `שם האירוע: …`. */
export function extractEventName(row: string[]): string | undefined {
  const text = row
    .map((c) => c.trim())
    .filter(Boolean)
    .join(" ");
  const m = /(?:שם\s*האירוע|event)\s*:\s*(.+)$/i.exec(text);
  const name = m?.[1]?.trim();
  return name || undefined;
}

/**
 * Гибкий qty из ячейки mapper:
 * - пусто → 1
 * - `+` → 1
 * - первое целое число в тексте (18, Laptop*2, 22 включая…)
 * - если числа нет → 1, весь текст уходит в note
 */
export function parseFlexibleQty(raw: string): { qty: number; qtyNote?: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { qty: 1 };
  if (trimmed === "+") return { qty: 1 };

  const compact = trimmed.replace(/\s+/g, "");
  if (/^-?\d+([.,]\d+)?$/.test(compact)) {
    const pure = parseQtyCell(trimmed);
    if (Number.isFinite(pure) && pure > 0) return { qty: Math.round(pure) };
  }

  const intMatch = trimmed.match(/(\d+)/);
  if (intMatch) {
    const qty = Number(intMatch[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, qtyNote: trimmed };
    }
  }
  return { qty: 1, qtyNote: trimmed };
}

/** Заголовок валиден, если есть qty и (name или code). */
export function headerHasRequiredColumns(row: string[]): boolean {
  const columns = row.map((cell) => resolveHeaderColumn(cell));
  const hasQty = columns.includes("qty");
  const hasName = columns.includes("name");
  const hasCode = columns.includes("code");
  return hasQty && (hasName || hasCode);
}

/** Preview первых N непустых строк для сообщения об ошибке. */
export function formatRowsPreview(rows: string[][], limit = 5): string {
  const nonempty = rows.filter(rowHasContent).slice(0, limit);
  if (nonempty.length === 0) return "(пусто)";
  return nonempty
    .map((row, i) => {
      const cells = row.map((c) => JSON.stringify(c.trim() === "" ? "" : c.trim()));
      return `${i + 1}: [${cells.join(", ")}]`;
    })
    .join("; ");
}

/**
 * name = колонка B (RU), если заполнена, иначе A (HE).
 * При нескольких name-колонках берём последнюю непустую (B после A).
 */
function pickDisplayName(nameCells: string[]): string {
  const filled = nameCells.map((c) => c.trim()).filter(Boolean);
  if (filled.length === 0) return "";
  return canonicalizeEquipmentName(filled[filled.length - 1]!);
}

function mergeLineNote(...parts: Array<string | undefined>): string | undefined {
  const text = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return text || undefined;
}

type ParsedMeta = { customerName: string; startDate?: string };

/** Собрать метаданные и индекс строки заголовка (если есть). */
export function findHeaderRowIndex(rows: string[][]): {
  headerIndex: number;
  meta: ParsedMeta;
} {
  let customerName = "";
  let startDate: string | undefined;
  const scanLimit = Math.min(rows.length, HEADER_SCAN_ROWS);

  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i]!;
    if (!rowHasContent(row)) continue;
    const date = extractMetaDate(row);
    if (date) startDate = date;
    const event = extractEventName(row);
    if (event) customerName = event;
  }

  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i]!;
    if (!rowHasContent(row) || isMetadataRow(row)) continue;
    if (headerHasRequiredColumns(row)) {
      return { headerIndex: i, meta: { customerName, startDate } };
    }
  }

  for (let i = 0; i < scanLimit; i += 1) {
    const row = rows[i]!;
    if (!rowHasContent(row) || isMetadataRow(row)) continue;
    if (rowLooksLikeHeader(row)) {
      return { headerIndex: i, meta: { customerName, startDate } };
    }
  }

  return { headerIndex: -1, meta: { customerName, startDate } };
}

/** Ячейка похожа на текстовое имя (не qty / не +). */
function looksLikeNameText(value: string): boolean {
  const v = value.trim();
  if (!v || v === "+") return false;
  if (looksLikeQty(v)) return false;
  return true;
}

/**
 * Fallback: колонки name,qty без строки заголовков (2–4 колонки).
 * Поддерживает A=name,B=qty и A=HE,B=RU,C=qty[,D=notes].
 */
function tryParseHeaderlessNameQty(table: string[][], meta: ParsedMeta): MapperOrderDraft | null {
  if (table.length === 0) return null;
  if (rowLooksLikeHeader(table[0]!)) return null;

  const width = Math.max(...table.map((row) => row.length));
  if (width < 2 || width > 4) return null;

  const dataRows = table.filter((row) => {
    if (isMetadataRow(row)) return false;
    const a = (row[0] ?? "").trim();
    const b = (row[1] ?? "").trim();
    if (!a) return false;
    if (looksLikeQty(b) || b === "+" || b === "") return true;
    if (isGlossaryEquipmentName(a) || isGlossaryEquipmentName(b)) return true;
    return false;
  });
  if (dataRows.length === 0) return null;
  const nonEmpty = table.filter((row) => rowHasContent(row) && !isMetadataRow(row));
  if (dataRows.length < Math.ceil(nonEmpty.length * 0.5)) return null;

  const today = todayIso();
  const buckets = new Map<string, LineBucket>();
  for (const row of dataRows) {
    const a = (row[0] ?? "").trim();
    const b = (row[1] ?? "").trim();
    const c = (row[2] ?? "").trim();
    const d = (row[3] ?? "").trim();

    let name = "";
    let qtyRaw = "";
    let colNote = "";

    // A=HE, B=RU (текст), C=qty
    if (b && looksLikeNameText(b) && (isGlossaryEquipmentName(a) || isGlossaryEquipmentName(b) || c !== "" || row.length >= 3)) {
      name = canonicalizeEquipmentName(b);
      qtyRaw = c;
      colNote = d;
    } else {
      name = canonicalizeEquipmentName(a);
      qtyRaw = b;
      colNote = c || d;
    }

    const { qty, qtyNote } = parseFlexibleQty(qtyRaw);
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;
    const key = `n:${normalizeEquipmentName(name)}`;
    const note = mergeLineNote(qtyNote, colNote);
    const prev = buckets.get(key);
    if (prev) {
      prev.qty += qty;
      if (note && !prev.note) prev.note = note;
    } else {
      buckets.set(key, { name, qty, ...(note ? { note } : {}) });
    }
  }
  if (buckets.size === 0) return null;
  const start = meta.startDate ? normalizeDate(meta.startDate, today) : today;
  return {
    customerName: meta.customerName ?? "",
    startDate: start,
    endDate: addDays(start, 2),
    notes: "",
    lines: [...buckets.values()],
  };
}

/**
 * Данные без заголовка: пары (известное HE/RU имя из glossary + qty).
 * Типичный mapper: A=HE, B=RU, C=qty, D=notes.
 */
function tryParseGlossaryDataRows(rows: string[][], meta: ParsedMeta): MapperOrderDraft | null {
  const scan = rows.slice(0, HEADER_SCAN_ROWS);
  const pairs: Array<{ name: string; qty: number; note?: string }> = [];

  for (const row of scan) {
    if (!rowHasContent(row) || isMetadataRow(row) || rowLooksLikeHeader(row)) continue;

    const a = (row[0] ?? "").trim();
    const b = (row[1] ?? "").trim();
    const c = (row[2] ?? "").trim();
    const d = (row[3] ?? "").trim();

    if (!isGlossaryEquipmentName(a) && !isGlossaryEquipmentName(b)) continue;

    let name = "";
    let qtyRaw = "";
    let colNote = "";

    if (b && looksLikeNameText(b)) {
      name = canonicalizeEquipmentName(b);
      qtyRaw = c;
      colNote = d;
    } else {
      name = canonicalizeEquipmentName(a || b);
      qtyRaw = isGlossaryEquipmentName(b) ? c : b;
      colNote = d || (isGlossaryEquipmentName(b) ? "" : c);
    }

    const { qty, qtyNote } = parseFlexibleQty(qtyRaw);
    const note = mergeLineNote(qtyNote, colNote);
    pairs.push({ name, qty, ...(note ? { note } : {}) });
  }

  if (pairs.length < 2) return null;

  const today = todayIso();
  const buckets = new Map<string, LineBucket>();
  for (const line of pairs) {
    const key = `n:${normalizeEquipmentName(line.name)}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.qty += line.qty;
      if (line.note && !prev.note) prev.note = line.note;
    } else {
      buckets.set(key, { name: line.name, qty: line.qty, ...(line.note ? { note: line.note } : {}) });
    }
  }
  const start = meta.startDate ? normalizeDate(meta.startDate, today) : today;
  return {
    customerName: meta.customerName ?? "",
    startDate: start,
    endDate: addDays(start, 2),
    notes: "",
    lines: [...buckets.values()],
  };
}

function formatColumnError(seenHeaders: string[], allRows: string[][]): Error {
  const seen = seenHeaders.map((h) => (h.trim() === "" ? "(пусто)" : `"${h.trim()}"`)).join(", ");
  const accepted = (["name", "qty", "code", "category"] as const)
    .map((field) => `${field}: ${ACCEPTED_HEADER_EXAMPLES[field].join(", ")}`)
    .join("; ");
  const preview = formatRowsPreview(allRows, 5);
  return new Error(
    `Не удалось сопоставить столбцы. В файле заголовки: [${seen || "нет"}]. ` +
      `Нужны qty и (code или name/название). Принимаются: ${accepted}. ` +
      `Либо файл из 2 колонок name,qty без строки заголовков. ` +
      `Первые строки файла: ${preview}`,
  );
}

function parseRowsWithHeader(
  header: string[],
  dataRows: string[][],
  meta: ParsedMeta,
): MapperOrderDraft {
  const columns = header.map((cell) => resolveHeaderColumn(cell));
  const hasCode = columns.includes("code");
  const hasName = columns.includes("name");
  const hasQty = columns.includes("qty");

  if (!hasQty || (!hasCode && !hasName)) {
    throw formatColumnError(header, [header, ...dataRows]);
  }

  const today = todayIso();
  let customerName = meta.customerName;
  let startDate = meta.startDate ?? "";
  let endDate = "";
  let externalId = "";
  const buckets = new Map<string, LineBucket>();

  for (const row of dataRows) {
    if (!rowHasContent(row) || isMetadataRow(row)) continue;

    const nameCells: string[] = [];
    const record: Partial<Record<MapperColumn, string>> = {};
    columns.forEach((column, index) => {
      if (!column) return;
      const value = row[index]?.trim() ?? "";
      if (column === "name") {
        nameCells.push(value);
        return;
      }
      record[column] = value;
    });

    if (record.customer) customerName = record.customer;
    if (record.start) startDate = record.start;
    if (record.end) endDate = record.end;
    if (record.external) externalId = record.external;

    const code = (record.code ?? "").trim().toUpperCase();
    const name = pickDisplayName(nameCells);
    const category = (record.category ?? "").trim();
    if (!code && !name) continue;

    const { qty, qtyNote } = parseFlexibleQty(record.qty ?? "");
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const colNote = (record.notes ?? "").trim();
    const lineNote = mergeLineNote(qtyNote, colNote);

    const key = name ? `n:${normalizeEquipmentName(name)}` : `c:${code}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.qty += qty;
      if (category && !prev.category) prev.category = category;
      if (code && !prev.code) prev.code = code;
      if (name && !prev.name) prev.name = name;
      if (lineNote && !prev.note) prev.note = lineNote;
    } else {
      buckets.set(key, {
        qty,
        ...(code ? { code } : {}),
        ...(name ? { name } : {}),
        ...(category ? { category } : {}),
        ...(lineNote ? { note: lineNote } : {}),
      });
    }
  }

  if (buckets.size === 0) {
    throw new Error(
      `Строки оборудования не найдены под заголовками. Первые строки файла: ${formatRowsPreview([header, ...dataRows], 5)}`,
    );
  }

  const start = normalizeDate(startDate, today);
  const draft: MapperOrderDraft = {
    customerName,
    startDate: start,
    endDate: normalizeDate(endDate, addDays(start, 2)),
    notes: "",
    lines: [...buckets.values()],
  };
  if (externalId) draft.externalId = externalId;
  return draft;
}

/** Таблица с заголовком: code и/или name + qty. Повтор одной позиции суммируется. */
export function parseMapperTable(rows: string[][]): MapperOrderDraft {
  if (rows.filter(rowHasContent).length === 0) throw new Error("В таблице нет строк");

  const { headerIndex, meta } = findHeaderRowIndex(rows);

  if (headerIndex >= 0 && headerHasRequiredColumns(rows[headerIndex]!)) {
    const header = rows[headerIndex]!;
    const dataRows = rows.slice(headerIndex + 1);
    return parseRowsWithHeader(header, dataRows, meta);
  }

  const cleaned = rows.filter((row) => rowHasContent(row) && !isMetadataRow(row));
  const headerless = tryParseHeaderlessNameQty(cleaned, meta);
  if (headerless) return headerless;

  const glossary = tryParseGlossaryDataRows(rows, meta);
  if (glossary) return glossary;

  const seen = headerIndex >= 0 ? rows[headerIndex]! : (rows.find((r) => rowHasContent(r)) ?? []);
  throw formatColumnError(seen, rows);
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
