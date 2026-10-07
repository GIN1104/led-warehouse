import { DomainError } from "@/lib/domain/errors";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Календарный день склада в Москве, формат ГГГГ-ММ-ДД. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function assertDateRange(start: string, end: string): void {
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new DomainError("Даты должны быть в формате ГГГГ-ММ-ДД");
  }
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== start) {
    throw new DomainError("Некорректная дата начала");
  }
  if (Number.isNaN(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== end) {
    throw new DomainError("Некорректная дата окончания");
  }
  if (end < start) {
    throw new DomainError("Дата окончания раньше даты начала");
  }
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (days > 366) {
    throw new DomainError("Интервал заказа длиннее года");
  }
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(new Date(ms));
}
