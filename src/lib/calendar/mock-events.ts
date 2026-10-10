import { addDays, todayIso } from "@/lib/dates";
import type { CalendarItem } from "@/lib/calendar/types";

/** Вымышленные слоты Google, пока календарь не подключён. Задания бригады сюда не входят. */
export function mockCalendarEvents(now = new Date()): CalendarItem[] {
  const today = todayIso(now);
  return [
    {
      id: "mock-google-call",
      title: "Созвон с площадкой (Google)",
      startDate: addDays(today, 1),
      endDate: addDays(today, 1),
      allDay: false,
      source: "mock",
      note: "Заглушка события Google Calendar",
    },
    {
      id: "mock-google-delivery",
      title: "Доставка внешней аренды",
      startDate: addDays(today, 5),
      endDate: addDays(today, 5),
      allDay: false,
      source: "mock",
      note: "Заглушка события Google Calendar",
    },
  ];
}