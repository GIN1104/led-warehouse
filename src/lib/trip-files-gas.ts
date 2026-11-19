/**
 * Deep-link / контракт стыка со standalone Apps Script Files.
 * Складской /files не меняем: это опциональный мост на GAS exec URL.
 *
 * Контракт: tripId (GAS ?trip=) ↔ orderId (склад ?orderId=) — один string id.
 *
 * Env (Pages / .env.local), без секретов:
 *   NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL=https://script.google.com/macros/s/…/exec
 */

/** Базовый exec URL без query (может быть пустым — GAS ещё не задеплоен). */
export function tripFilesGasExecBase(): string {
  const raw = process.env.NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL ?? "";
  return raw.replace(/\/$/, "").trim();
}

/**
 * URL Apps Script Files для заказа.
 * @returns null если exec URL не задан
 */
export function tripFilesGasHref(orderId: string): string | null {
  const base = tripFilesGasExecBase();
  const id = orderId.trim();
  if (!base || !id) return null;
  const url = new URL(base);
  url.searchParams.set("trip", id);
  url.searchParams.set("view", "files");
  return url.toString();
}

/** Черновик webhook event от GAS (Integration.gs → WEBHOOK_CALLBACK_URL). */
export type TripFilesWebhookEvent = {
  event: "trip-files.saveAndSend";
  tripId: string;
  orderId: string;
  equipmentList: string;
  files: unknown[];
  sheetLinks: string[];
  notifiedFileIds: string[];
  notifiedLinks: string[];
  removedLinkSilent?: boolean;
  updatedAt: number;
};

/**
 * Stub приёмника webhook (фаза 2).
 * Сейчас no-op: склад продолжает mock orderFilesApi.
 */
export async function handleTripFilesWebhookStub(
  _payload: TripFilesWebhookEvent,
): Promise<{ ok: true; skipped: true }> {
  return { ok: true, skipped: true };
}
