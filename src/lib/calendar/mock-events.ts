import { addDays, todayIso } from "@/lib/dates";
import type { CalendarItem } from "@/lib/calendar/types";

/** Демо-события без OAuth: задачи склада и вымышленные Google-слоты. */
export function mockCalendarEvents(now = new Date()): CalendarItem[] {
  const today = todayIso(now);
  return [
    {
      id: "mock-task-unload",
      title: "Разгрузка кейсов после выезда",
      startDate: today,
      endDate: today,
      allDay: true,
      source: "task",
      note: "Демо-задача (mock)",
    },
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
      id: "mock-task-inventory",
      title: "Инвентаризация кабелей",
      startDate: addDays(today, 3),
      endDate: addDays(today, 3),
      allDay: true,
      source: "task",
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