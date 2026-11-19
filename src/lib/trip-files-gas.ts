/**
 * Deep-link / контракт стыка со Apps Script (полный led-trips или узкий trip-files).
 * Складской /files не меняем: это опциональный мост на GAS exec URL.
 *
 * Контракт: tripId (GAS ?trip=) ↔ orderId (склад ?orderId=) — один string id.
 *
 * Env (Pages / .env.local), без секретов:
 *   NEXT_PUBLIC_LED_TRIPS_GAS_EXEC_URL=…   — полный клон «Выезды»
 *   NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL=…  — узкий Files-only (fallback)
 */

function normalizeExecBase(raw: string | undefined): string {
  return (raw ?? "").replace(/\/$/, "").trim();
}

/** Базовый exec URL: сначала полный led-trips, затем trip-files. */
export function tripFilesGasExecBase(): string {
  return (
    normalizeExecBase(process.env.NEXT_PUBLIC_LED_TRIPS_GAS_EXEC_URL) ||
    normalizeExecBase(process.env.NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL)
  );
}

/**
 * URL Apps Script Files для заказа (`?trip=&view=files`).
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

/** Черновик webhook event от GAS (Notify/Integration → WEBHOOK_CALLBACK_URL). */
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
