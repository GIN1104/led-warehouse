/** Дефолт временного допуска (дни). Approve/ручное добавление без срока = бессрочно до revoke. */
export const DEFAULT_TEMP_ACCESS_DAYS = 30;

export const TEMP_ACCESS_DAY_OPTIONS = [7, 30] as const;

export type TempAccessDays = (typeof TEMP_ACCESS_DAY_OPTIONS)[number];

export function expiresAtFromDays(days: number, now = Date.now()): number {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("Срок доступа должен быть положительным числом дней");
  }
  return now + Math.floor(days) * 86_400_000;
}

export function isAccessExpired(expiresAt: number | null | undefined, now = Date.now()): boolean {
  if (expiresAt == null) return false;
  return expiresAt <= now;
}
