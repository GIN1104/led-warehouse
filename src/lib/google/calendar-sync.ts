import type { CalendarItem, GoogleSyncStatus } from "@/lib/calendar/types";
import { GOOGLE_CALENDAR_SCOPES, PROJECT_GOOGLE_EMAIL, googleClientId } from "@/lib/google/config";
import { clearStoredGoogleEvents, writeStoredGoogleEvents } from "@/lib/google/event-cache";
import { clearGoogleAccessToken, forgetGoogleAccessToken, getCachedGoogleAccessToken, requestGoogleAccessToken } from "@/lib/google/gis";
import { mapGoogleEvents, type GoogleEvent } from "@/lib/google/map-events";
import { browserTokenStorage, hasStoredGoogleConnection } from "@/lib/google/token-store";

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
  if (getCachedGoogleAccessToken() || hasStoredGoogleConnection(browserTokenStorage())) {
    return { kind: "connected", clientId: masked, email: PROJECT_GOOGLE_EMAIL };
  }
  return { kind: "ready", clientId: masked };
}

export type SyncResult = {
  status: GoogleSyncStatus;
  events: CalendarItem[];
  scopes: readonly string[];
};

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
    if (response.status === 401) forgetGoogleAccessToken();
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
  writeStoredGoogleEvents(events);
  return {
    status: getGoogleSyncStatus(),
    events,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

/** Повторная синхронизация. Новое окно Google открывается только по нажатию, не при загрузке страницы. */
export async function syncGoogleCalendar(): Promise<SyncResult> {
  if (!googleClientId()) {
    return { status: { kind: "missing_client_id" }, events: [], scopes: GOOGLE_CALENDAR_SCOPES };
  }
  const token = await requestGoogleAccessToken();
  const events = await fetchCalendarEvents(token);
  writeStoredGoogleEvents(events);
  return {
    status: getGoogleSyncStatus(),
    events,
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}

export function disconnectGoogleCalendar(): void {
  clearGoogleAccessToken();
  clearStoredGoogleEvents();
}