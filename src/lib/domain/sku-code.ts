/** Нормализация названия для стабильного ключа: trim, регистр, пробелы, кавычки. */
export function normalizeEquipmentName(name: string): string {
  return name
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/["«»„“”‟″]/g, '"')
    .replace(/['’‘‛′]/g, "'")
    .replace(/[×✕✖]/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ");
}

/** Короткий стабильный хеш от строки (не крипто, только для суффикса кода). */
export function shortNameHash(value: string, length = 4): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return hex.slice(0, Math.max(2, Math.min(8, length)));
}

const CYR_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterateSlug(name: string): string {
  const lower = normalizeEquipmentName(name);
  let out = "";
  for (const char of lower) {
    if (CYR_MAP[char] !== undefined) out += CYR_MAP[char];
    else out += char;
  }
  return out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Человекочитаемый кандидат кода: TV-32, CAB-P25 и т.п.
 * Стабилен для одного и того же нормализованного имени.
 */
export function suggestSkuCode(name: string): string {
  const raw = name.trim();
  const norm = normalizeEquipmentName(raw);

  const tvMatch =
    /(?:^|[\s(])(?:tv|телевизор|телев\.?)[\s-]*(\d{2,3})\b/i.exec(raw) ??
    (/телевизор|televisor|\btv\b/i.test(raw) ? /\b(\d{2,3})\s*(?:["'″]|дюйм|inch|in\b)?/i.exec(raw) : null);
  if (tvMatch?.[1]) {
    return `TV-${tvMatch[1]}`;
  }

  const cabMatch = /(?:кабинет|cabinet|\bcab\b)[^\d.]*p?\s*([\d]+(?:[.,]\d+)?)/i.exec(raw);
  if (cabMatch?.[1]) {
    const pitch = cabMatch[1].replace(",", ".").replace(".", "");
    return `CAB-P${pitch}`.slice(0, 32);
  }

  const ctlMatch = /(?:контроллер|controller|nova)/i.exec(raw);
  if (ctlMatch) {
    const slug = transliterateSlug(raw).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
    return (slug.startsWith("CTL") ? slug : `CTL-${slug || shortNameHash(norm)}`).slice(0, 32);
  }

  const slug = transliterateSlug(raw).toUpperCase();
  if (slug.length >= 2) {
    return slug.slice(0, 32);
  }
  return `SKU-${shortNameHash(norm, 6)}`;
}

/**
 * Стабильный уникальный code: один name_key → один code.
 * При коллизии с другим именем добавляется короткий хеш имени.
 */
export function generateStableSkuCode(name: string, takenCodes: Iterable<string>): string {
  const taken = new Set([...takenCodes].map((code) => code.toUpperCase()));
  const base = suggestSkuCode(name).toUpperCase();
  const normalizedBase = /^[A-Z0-9][A-Z0-9-]{1,31}$/.test(base) ? base : `SKU-${shortNameHash(normalizeEquipmentName(name), 6)}`;
  if (!taken.has(normalizedBase)) return normalizedBase;

  const hash = shortNameHash(normalizeEquipmentName(name), 4);
  const withHash = `${normalizedBase.slice(0, 27)}-${hash}`.slice(0, 32);
  if (!taken.has(withHash)) return withHash;

  for (let i = 2; i < 100; i += 1) {
    const candidate = `${normalizedBase.slice(0, 26)}-${i}`.slice(0, 32);
    if (!taken.has(candidate)) return candidate;
  }
  return `SKU-${shortNameHash(`${normalizeEquipmentName(name)}-${Date.now()}`, 8)}`;
}
