import type { CalendarItem } from "@/lib/calendar/types";

export type GoogleEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
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

function eventNote(event: GoogleEvent): string | undefined {
  const parts: string[] = [];
  const description = event.description?.trim();
  const location = event.location?.trim();
  const meet = event.hangoutLink?.trim();
  if (description) parts.push(description);
  if (location) parts.push(location);
  const joined = parts.join("\n");
  if (meet && !joined.includes(meet)) parts.push(meet);
  const note = parts.join("\n").trim();
  return note || undefined;
}

export function mapGoogleEvents(items: GoogleEvent[]): CalendarItem[] {
  const result: CalendarItem[] = [];
  for (const event of items) {
    const startDate = toIsoDay(event.start?.date ?? event.start?.dateTime);
    if (!startDate) continue;
    let endDate = toIsoDay(event.end?.date ?? event.end?.dateTime) ?? startDate;
    if (event.end?.date && endDate > startDate) {
      const exclusive = new Date(`${endDate}T00:00:00Z`);
      exclusive.setUTCDate(exclusive.getUTCDate() - 1);
      endDate = exclusive.toISOString().slice(0, 10);
    }
    if (endDate < startDate) endDate = startDate;
    const href = event.htmlLink?.trim();
    result.push({
      id: `google-${event.id ?? `${startDate}-${event.summary ?? "event"}`}`,
      title: event.summary?.trim() || "(без названия)",
      startDate,
      endDate,
      allDay: Boolean(event.start?.date),
      source: "google",
      note: eventNote(event),
      href: href || undefined,
    });
  }
  return result;
}
