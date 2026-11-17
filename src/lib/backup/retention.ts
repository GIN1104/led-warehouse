import { parseBackupDumpName } from "@/lib/backup/naming";

export type RetentionItem = { key: string; name: string; lastModified?: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Оставляем: всё за последние keepDays дней + по одному dump на календарный месяц старше этого окна.
 * Возвращает ключи к удалению.
 */
export function keysToDeleteForRetention(
  items: RetentionItem[],
  opts?: { keepDays?: number; now?: Date },
): string[] {
  const keepDays = opts?.keepDays ?? 14;
  const now = opts?.now ?? new Date();
  const cutoff = now.getTime() - keepDays * DAY_MS;

  const dated = items
    .map((item) => {
      const fromName = parseBackupDumpName(item.name);
      const when = fromName ?? item.lastModified ?? null;
      return { ...item, when };
    })
    .filter((item): item is RetentionItem & { when: Date } => item.when instanceof Date);

  const keep = new Set<string>();
  const byMonth = new Map<string, { key: string; time: number }>();

  for (const item of dated) {
    const time = item.when.getTime();
    if (time >= cutoff) {
      keep.add(item.key);
      continue;
    }
    const monthKey = `${item.when.getUTCFullYear()}-${String(item.when.getUTCMonth() + 1).padStart(2, "0")}`;
    const prev = byMonth.get(monthKey);
    if (!prev || time > prev.time) byMonth.set(monthKey, { key: item.key, time });
  }
  for (const entry of byMonth.values()) keep.add(entry.key);

  return dated.filter((item) => !keep.has(item.key)).map((item) => item.key);
}
