import { eachDate } from "@/lib/dates";
import type { CalendarItem } from "@/lib/calendar/types";

/** Заказы проката → элементы календаря (весь интервал start..end). */
export function ordersToCalendarItems(
  orders: { id: string; customerName: string; startDate: string; endDate: string; status: string }[],
): CalendarItem[] {
  return orders
    .filter((order) => order.status === "confirmed")
    .map((order) => ({
      id: `order-${order.id}`,
      title: order.customerName,
      startDate: order.startDate,
      endDate: order.endDate,
      allDay: true,
      source: "order" as const,
      orderId: order.id,
    }));
}

export function mergeCalendarItems(...groups: CalendarItem[][]): CalendarItem[] {
  const byId = new Map<string, CalendarItem>();
  for (const group of groups) {
    for (const item of group) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, "ru"));
}

/** Элементы, пересекающие день (включительно). */
export function itemsOnDate(items: CalendarItem[], isoDate: string): CalendarItem[] {
  return items.filter((item) => item.startDate <= isoDate && isoDate <= item.endDate);
}

/** Ячейки сетки месяца: понедельник — первый день недели (ISO). */
export function monthGrid(year: number, monthIndex: number): string[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - startPad);
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const endPad = (7 - ((last.getUTCDay() + 6) % 7) - 1) % 7;
  const gridEnd = new Date(last);
  gridEnd.setUTCDate(last.getUTCDate() + endPad);
  return eachDate(gridStart.toISOString().slice(0, 10), gridEnd.toISOString().slice(0, 10));
}

export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}