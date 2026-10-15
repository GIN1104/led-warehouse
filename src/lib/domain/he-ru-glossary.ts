/**
 * Словарь оборудования mapper: иврит → русский.
 * Источник: docs/equipment-he-ru-glossary.md
 */

/** Пары HE → RU (канонический display name). */
export const HE_RU_GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ["מסך", "Экран"],
  ["שפרייצים", "Шпрайцы"],
  ["תלייה", "Подвес"],
  ["רצועות תלייה", "Тросы для подвеса"],
  ["מחשב", "Компьютер"],
  ["פרוצסור", "Процессор"],
  ["כרטיס לד", "NovaStar VX1000"],
  ["CVT / ממיר אופטי", "CVT10"],
  ["קבל תקשורת", "Тикшорет (сетевой кабель)"],
  ["תקשורת תארוך", "Тикшорет Длинный"],
  ["ספיקונים", "Спикон"],
  ["ספיקונים מגשרים", "Спикон соединяющий кубики"],
  ["כבל חשמל", "Удлинитель электрический"],
  ["רובוט", "Робот 32А"],
  ["תלת פאזי", "Кабель 32А (трёхфазный)"],
  ["כבל SDI", "Кабель SDI"],
  ["כבל אופטי", "Оптический кабель"],
  ["TV", "ТВ"],
  ["הופכים חשמל", "Переходники: 63→32, 32→16"],
  ["רצ'אטים", "Рачеты"],
  ["תיק כלים", "Сумка с инструментами"],
  ["אזיקונים", "Азиконим"],
  ["גפה", "Гафа"],
  ["ברגים", "Шурупы"],
  ["מברגה", "Шуруповёрт"],
  ["במה", "Сцены"],
  ["טראנס", "Ферма (трас)"],
] as const;

/** Нормализация ключа словаря: NFC, trim, пробелы, регистр латиницы. */
export function normalizeGlossaryKey(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const HE_TO_RU = new Map<string, string>(
  HE_RU_GLOSSARY.map(([he, ru]) => [normalizeGlossaryKey(he), ru]),
);

const RU_CANONICAL = new Map<string, string>(
  HE_RU_GLOSSARY.map(([, ru]) => [normalizeGlossaryKey(ru), ru]),
);

/**
 * Каноническое русское название для display / name_key / code.
 * Точное совпадение HE-ключа или уже известного RU → канон RU.
 */
export function canonicalizeEquipmentName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const key = normalizeGlossaryKey(trimmed);
  return HE_TO_RU.get(key) ?? RU_CANONICAL.get(key) ?? trimmed;
}

/** true, если строка — известный HE-ключ словаря. */
export function isHebrewGlossaryName(raw: string): boolean {
  return HE_TO_RU.has(normalizeGlossaryKey(raw));
}

/** true, если строка — известный HE или канонический RU из словаря. */
export function isGlossaryEquipmentName(raw: string): boolean {
  const key = normalizeGlossaryKey(raw);
  return HE_TO_RU.has(key) || RU_CANONICAL.has(key);
}
