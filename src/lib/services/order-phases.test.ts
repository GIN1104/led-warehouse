import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { seedIfEmpty } from "@/lib/db/seed";
import { updateOrderPhases } from "@/lib/services/order-phases";
import { listOrders } from "@/lib/services/queries";

describe("фазы заказа монтаж/шоу/демонтаж", () => {
  it("сохраняет даты фаз внутри периода", () => {
    const db = createDb();
    seedIfEmpty(db);
    const order = listOrders(db)[0];
    if (!order) throw new Error("no order");
    const next = updateOrderPhases(
      db,
      order.id,
      {
        mountDate: order.startDate,
        showStart: order.startDate,
        showEnd: order.endDate,
        demountDate: order.endDate,
        phase: "show",
      },
      "manager",
    );
    expect(next.phase).toBe("show");
    expect(next.mountDate).toBe(order.startDate);
    const refreshed = listOrders(db).find((row) => row.id === order.id);
    expect(refreshed?.phase).toBe("show");
    const audit = db.get<{ action: string; payload: string }>(
      `SELECT action, payload FROM audit_log WHERE entity_id = ? AND action = 'order.phase'`,
      [order.id],
    );
    expect(audit?.action).toBe("order.phase");
    expect(JSON.parse(audit?.payload ?? "{}")).toMatchObject({ to: "show" });
  });

  it("отклоняет даты вне периода", () => {
    const db = createDb();
    seedIfEmpty(db);
    const order = listOrders(db)[0];
    if (!order) throw new Error("no order");
    expect(() =>
      updateOrderPhases(db, order.id, {
        mountDate: "1999-01-01",
        phase: "mount",
      }),
    ).toThrow(/фаз/);
  });
});
