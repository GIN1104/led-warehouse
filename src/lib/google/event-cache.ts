import type { CalendarItem } from "@/lib/calendar/types";
import { browserTokenStorage } from "@/lib/google/token-store";

const EVENTS_KEY = "led-warehouse:google-events";

/** Последние события Google, чтобы карточка не пустела, пока токен обновляется. */
export function readStoredGoogleEvents(): CalendarItem[] {
  const storage = browserTokenStorage();
  const raw = storage?.getItem(EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CalendarItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.title === "string");
  } catch {
    storage?.removeItem(EVENTS_KEY);
    return [];
  }
}

export function writeStoredGoogleEvents(items: CalendarItem[]): void {
  const storage = browserTokenStorage();
  if (!storage) return;
  try {
    storage.setItem(EVENTS_KEY, JSON.stringify(items));
  } catch {
    storage.removeItem(EVENTS_KEY);
  }
}

export function clearStoredGoogleEvents(): void {
  browserTokenStorage()?.removeItem(EVENTS_KEY);
}
