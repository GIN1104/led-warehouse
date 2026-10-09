import { describe, expect, it } from "vitest";
import { itemsOnDate, mergeCalendarItems, monthGrid, ordersToCalendarItems } from "@/lib/calendar/merge";

describe("calendar merge", () => {
  it("превращает подтверждённые заказы в элементы", () => {
    const items = ordersToCalendarItems([
      { id: "1", customerName: "Арена", startDate: "2026-10-10", endDate: "2026-10-12", status: "confirmed" },
      { id: "2", customerName: "Отменён", startDate: "2026-10-10", endDate: "2026-10-10", status: "cancelled" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.orderId).toBe("1");
    expect(itemsOnDate(items, "2026-10-11")).toHaveLength(1);
    expect(itemsOnDate(items, "2026-10-13")).toHaveLength(0);
  });

  it("месяц начинается с понедельника", () => {
    const days = monthGrid(2026, 9);
    expect(days[0]).toBe("2026-09-28");
    expect(days.length % 7).toBe(0);
  });

  it("merge не дублирует id", () => {
    const a = [{ id: "x", title: "A", startDate: "2026-10-01", endDate: "2026-10-01", allDay: true, source: "mock" as const }];
    const b = [{ id: "x", title: "B", startDate: "2026-10-01", endDate: "2026-10-01", allDay: true, source: "task" as const }];
    expect(mergeCalendarItems(a, b)).toHaveLength(1);
    expect(mergeCalendarItems(a, b)[0]?.title).toBe("B");
  });
});