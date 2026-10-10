import type { CalendarItem, GoogleSyncStatus } from "@/lib/calendar/types";
import { GOOGLE_CALENDAR_SCOPES, PROJECT_GOOGLE_EMAIL, googleClientId } from "@/lib/google/config";
import { clearGoogleAccessToken, getCachedGoogleAccessToken, requestGoogleAccessToken } from "@/lib/google/gis";

/**
 * Синхронизация Google Calendar через GIS Token Client (без client secret).
 * Пароль аккаунта не используется.
 */

export function getGoogleSyncStatus(): GoogleSyncStatus {
  const clientId = googleClientId();
  if (!clientId) {
    return { kind: "missing_client_id" };
  }
  const masked = clientId.length > 12 ? `${clientId.slice(0, 8)}…` : clientId;
  if (getCachedGoogleAccessToken()) {
    return { kind: "connected", clientId: masked, email: PROJECT_GOOGLE_EMAIL };
  }
  return { kind: "ready", clientId: masked };
}

export type SyncResult = {
  status: GoogleSyncStatus;
  events: CalendarItem[];
  scopes: readonly string[];
};

type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function toIsoDay(value?: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(parsed));
}

function mapGoogleEvents(items: GoogleEvent[]): CalendarItem[] {
  const result: CalendarItem[] = [];
  for (const event of items) {
    const startDate = toIsoDay(event.start?.date ?? event.start?.dateTime);
    if (!startDate) continue;
    let endDate = toIsoDay(event.end?.date ?? event.end?.dateTime) ?? startDate;
    // У all-day end в Calendar API — exclusive; для UI делаем inclusive.
    if (event.end?.date && endDate > startDate) {
      const exclusive = new Date(`${endDate}T00:00:00Z`);
      exclusive.setUTCDate(exclusive.getUTCDate() - 1);
      endDate = exclusive.toISOString().slice(0, 10);
    }
    if (endDate < startDate) endDate = startDate;
    result.push({
      id: `google-${event.id ?? `${startDate}-${event.summary ?? "event"}`}`,
      title: event.summary?.trim() || "(без названия)",
      startDate,
      endDate,
      allDay: Boolean(event.start?.date),
      source: "google",
      note: event.description?.trim() || undefined,
    });
  }
  return result;
}

async function fetchCalendarEvents(accessToken: string): Promise<CalendarItem[]> {
  const timeMin = new Date();
  timeMin.setUTCMonth(timeMin.getUTCMonth() - 1);
  const timeMax = new Date();
  timeMax.setUTCMonth(timeMax.getUTCMonth() + 3);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401) clearGoogleAccessToken();
    throw new Error(`Calendar API ${response.status}: ${body.slice(0, 180)}`);
  }
  const data = (await response.json()) as { items?: GoogleEvent[] };
  return mapGoogleEvents(data.items ?? []);
}

/** Подключить Google (consent / token) без client secret. */
export async function connectGoogleCalendar(): Promise<SyncResult> {
  if (!googleClientId()) {
    return { status: { kind: "missing_client_id" }, events: [], scopes: GOOGLE_CALENDAR_SCOPES };
  }
  const token = await requestGoogleAccessToken();
  const events = await fetchCalendarEvents(token);
  return {
    status: getGoogleSyncStatus(),
    events,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

/** Повторная синхронизация; при отсутствии токена откроет GIS. */
export async function syncGoogleCalendar(): Promise<SyncResult> {
  if (!googleClientId()) {
    return { status: { kind: "missing_client_id" }, events: [], scopes: GOOGLE_CALENDAR_SCOPES };
  }
  const token = await requestGoogleAccessToken();
  const events = await fetchCalendarEvents(token);
  return {
    status: getGoogleSyncStatus(),
    events,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

export function disconnectGoogleCalendar(): void {
  clearGoogleAccessToken();
}