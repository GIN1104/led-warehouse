import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { seedIfEmpty } from "@/lib/db/seed";
import { createPerson } from "@/lib/services/people";
import { updateOrderPhases } from "@/lib/services/order-phases";
import { listOrders } from "@/lib/services/queries";
import { listTelegramOutbox } from "@/lib/telegram/notify";

describe("фазы заказа монтаж/шоу/демонтаж", () => {
  it("сохраняет даты фаз внутри периода", () => {
    const db = createDb();
    seedIfEmpty(db);
    const order = listOrders(db)[0];
    if (!order) throw new Error("no order");
    createPerson(db, {
      name: "Phase TG",
      role: "manager",
      email: "phase-tg@led.local",
      telegramChatId: "99887766",
    });
    const next = updateOrderPhases(db, order.id, {
      mountDate: order.startDate,
      showStart: order.startDate,
      showEnd: order.endDate,
      demountDate: order.endDate,
      phase: "show",
    });
    expect(next.phase).toBe("show");
    expect(next.mountDate).toBe(order.startDate);
    const refreshed = listOrders(db).find((row) => row.id === order.id);
    expect(refreshed?.phase).toBe("show");
    expect(
      listTelegramOutbox(db).some(
        (row) => row.kind === "order_phase" && row.payload.includes("→ show") && row.chatId === "99887766",
      ),
    ).toBe(true);
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
