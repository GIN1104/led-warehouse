/** Единый элемент календаря: Google, локальный заказ или задача. */
export type CalendarItemSource = "google" | "order" | "task" | "mock";

export type CalendarItem = {
  id: string;
  title: string;
  /** День начала ГГГГ-ММ-ДД (Москва / календарный день склада). */
  startDate: string;
  /** День окончания включительно; для однодневных = startDate. */
  endDate: string;
  allDay: boolean;
  source: CalendarItemSource;
  /** Ссылка на заказ склада, если source === "order". */
  orderId?: string;
  /** Ссылка на событие в Google Calendar. */
  href?: string;
  /** Задание бригады, если source === "task". */
  taskId?: string;
  /** Цвет работника, #rrggbb. */
  color?: string;
  /** Прогресс задания, 0–100. */
  progress?: number;
  note?: string;
};

export type GoogleSyncStatus =
  | { kind: "idle" }
  | { kind: "missing_client_id" }
  | { kind: "stub"; message: string }
  | { kind: "ready"; clientId: string }
  | { kind: "connected"; clientId: string; email: string }
  | { kind: "error"; message: string };