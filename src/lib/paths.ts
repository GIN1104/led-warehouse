import { tripFilesGasHref } from "@/lib/trip-files-gas";

export function orderHref(id: string): string {
  return `/orders/view/?id=${encodeURIComponent(id)}`;
}

/** Файлы и ссылки к заказу (peer view=files) — складской маршрут. */
export function filesHref(orderId?: string): string {
  if (!orderId) return "/files/";
  return `/files/?orderId=${encodeURIComponent(orderId)}`;
}

/**
 * Предпочесть standalone GAS Files, если задан NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL;
 * иначе складской /files (без изменений поведения по умолчанию).
 */
export function filesAppHref(orderId: string): string {
  return tripFilesGasHref(orderId) ?? filesHref(orderId);
}
