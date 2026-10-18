/**
 * Имена файлов Excel на Google Drive: дата первой в формате ДД-ММ-ГГГГ.
 * Пример: `18-10-2026.xlsx` или `18-10-2026 Trask Splesh.xlsx`.
 * Внутренние даты склада (ISO ГГГГ-ММ-ДД) не меняем — только имя файла.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Небезопасные для имени файла символы (путь, управляющие, кавычки). */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]+/g;

export type DriveExcelFileNameInput = {
  /** Календарный день события/заказа в ISO: ГГГГ-ММ-ДД. */
  date: string;
  /** Название события или заказчика — опционально, после даты. */
  eventName?: string | null;
  /** Расширение с точкой или без; по умолчанию `.xlsx`. */
  extension?: string | null;
};

/** ДД-ММ-ГГГГ из ISO-даты. */
export function formatDriveDateStamp(isoDate: string): string {
  const match = ISO_DAY.exec(isoDate.trim());
  if (!match) {
    throw new Error("Дата для имени файла Drive должна быть ГГГГ-ММ-ДД");
  }
  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

/** Убрать опасные символы, хвост расширения и обрезать длинное название события. */
export function sanitizeDriveEventName(raw: string | null | undefined): string {
  if (raw == null) return "";
  const cleaned = raw
    .replace(UNSAFE_NAME, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(xlsx|xls|csv)$/i, "")
    .replace(/\.+$/g, "")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
}

function normalizeExtension(extension: string | null | undefined): string {
  const raw = (extension ?? ".xlsx").trim();
  if (!raw) return ".xlsx";
  const withDot = raw.startsWith(".") ? raw : `.${raw}`;
  return withDot.toLowerCase();
}

/**
 * Имя файла для сохранения/экспорта на Drive.
 * Дата всегда первая: `18-10-2026.xlsx` или `18-10-2026 Имя события.xlsx`.
 */
export function buildDriveExcelFileName(input: DriveExcelFileNameInput): string {
  const stamp = formatDriveDateStamp(input.date);
  const ext = normalizeExtension(input.extension);
  const event = sanitizeDriveEventName(input.eventName);
  return event ? `${stamp} ${event}${ext}` : `${stamp}${ext}`;
}

/** Подсказка имени из draft mapper (дата заказа + заказчик/событие). */
export function driveFileNameFromMapperDraft(draft: {
  startDate: string;
  customerName?: string | null;
}): string {
  return buildDriveExcelFileName({
    date: draft.startDate,
    eventName: draft.customerName,
  });
}
