import type { AccessRequestRow } from "@/lib/services/access-requests";

/**
 * Shared API — remote pending источник истины (локальный id часто другой).
 * Без API — только локальные. Смешиваем только если remote ещё не подтянут (null).
 */
export function mergePending(local: AccessRequestRow[], remote: AccessRequestRow[] | null): AccessRequestRow[] {
  if (remote !== null) {
    return [...remote].sort((a, b) => b.createdAt - a.createdAt);
  }
  return [...local].sort((a, b) => b.createdAt - a.createdAt);
}
