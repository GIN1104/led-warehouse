/** Имя dump-файла: 2026-11-17T21-48-ledvision.dump */

export function backupDumpFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  return `${y}-${m}-${d}T${hh}-${mm}-ledvision.dump`;
}

/** Парсит UTC-время из имени dump; null если формат чужой. */
export function parseBackupDumpName(name: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-ledvision\.dump$/i.exec(name.trim());
  if (!match) return null;
  const [, y, mo, d, hh, mm] = match;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isBackupDumpName(name: string): boolean {
  return parseBackupDumpName(name) !== null;
}
