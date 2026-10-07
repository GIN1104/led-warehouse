import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db";
import { locations, skus, stockBalances, users } from "@/lib/db/schema";
import { applyMovement, createOrder, ingestScan, setOrderStatus } from "@/lib/services/ledger";
import { getOrderDetail, listAlerts, listExternalHires } from "@/lib/services/queries";

function setup() {
  const db = createDb(":memory:");
  db.insert(users).values({ id: "manager", name: "Мария", role: "manager" }).run();
  db.insert(locations).values({ id: "loc", name: "Склад", kind: "warehouse", parentId: null }).run();
  db.insert(skus)
    .values({
      id: "CAB-P25",
      code: "CAB-P25",
      name: "Кабинет",
      category: "Кабинеты",
      unit: "шт",
      trackMode: "quantity",
      description: "",
    })
    .run();
  return db;
}

describe("склад и заказы", () => {
  it("приход увеличивает остаток и не даёт уйти в минус", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 10, reason: "тест" }, "manager");
    const balance = db.select().from(stockBalances).where(eq(stockBalances.skuId, "CAB-P25")).get();
    expect(balance?.qtyOnHand).toBe(10);
    expect(() =>
      applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "out", qty: 11, reason: "тест" }, "manager"),
    ).toThrow(/Недостаточно остатка/);
    const after = db.select().from(stockBalances).where(eq(stockBalances.skuId, "CAB-P25")).get();
    expect(after?.qtyOnHand).toBe(10);
  });

  it("сохраняет заказ при нехватке и создаёт внешнюю аренду", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 10, reason: "тест" }, "manager");
    const first = createOrder(
      db,
      {
        customerName: "Первый заказ",
        startDate: "2026-10-07",
        endDate: "2026-10-08",
        lines: [{ skuId: "CAB-P25", qty: 8 }],
        createdAt: 1,
      },
      "manager",
    );
    expect(first.shortages).toEqual([]);

    const second = createOrder(
      db,
      {
        customerName: "Второй заказ",
        startDate: "2026-10-08",
        endDate: "2026-10-09",
        lines: [{ skuId: "CAB-P25", qty: 6 }],
        createdAt: 2,
      },
      "manager",
    );
    expect(second.shortages).toEqual([{ skuId: "CAB-P25", qty: 4 }]);

    const detail = getOrderDetail(db, second.orderId);
    expect(detail?.lines[0]?.qtySoftReserved).toBe(2);
    expect(detail?.lines[0]?.qtyShortage).toBe(4);
    const hires = listExternalHires(db).filter((hire) => hire.status === "needed");
    expect(hires).toHaveLength(1);
    expect(hires[0]?.qty).toBe(4);
    expect(listAlerts(db, "open")).toHaveLength(1);
  });

  it("не пересекающиеся даты не отнимают остаток друг у друга", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 10, reason: "тест" }, "manager");
    const early = createOrder(
      db,
      {
        customerName: "Ранний",
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        lines: [{ skuId: "CAB-P25", qty: 10 }],
        createdAt: 1,
      },
      "manager",
    );
    const late = createOrder(
      db,
      {
        customerName: "Поздний",
        startDate: "2026-10-20",
        endDate: "2026-10-21",
        lines: [{ skuId: "CAB-P25", qty: 10 }],
        createdAt: 2,
      },
      "manager",
    );
    expect(getOrderDetail(db, early.orderId)?.lines[0]?.qtyShortage).toBe(0);
    expect(getOrderDetail(db, late.orderId)?.lines[0]?.qtyShortage).toBe(0);
  });

  it("отмена раннего заказа снимает нехватку со следующего", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 10, reason: "тест" }, "manager");
    const first = createOrder(
      db,
      {
        customerName: "Первый",
        startDate: "2026-10-07",
        endDate: "2026-10-07",
        lines: [{ skuId: "CAB-P25", qty: 8 }],
        createdAt: 1,
      },
      "manager",
    );
    const second = createOrder(
      db,
      {
        customerName: "Второй",
        startDate: "2026-10-07",
        endDate: "2026-10-07",
        lines: [{ skuId: "CAB-P25", qty: 6 }],
        createdAt: 2,
      },
      "manager",
    );
    expect(second.shortages[0]?.qty).toBe(4);
    setOrderStatus(db, first.orderId, "cancelled", "manager");
    const detail = getOrderDetail(db, second.orderId);
    expect(detail?.lines[0]?.qtyShortage).toBe(0);
    expect(detail?.lines[0]?.qtySoftReserved).toBe(6);
    expect(listExternalHires(db).every((hire) => hire.status === "closed" || hire.orderId !== second.orderId)).toBe(true);
  });

  it("повтор скана с тем же event_id не двигает остаток", () => {
    const db = setup();
    const first = ingestScan(
      db,
      { eventId: "evt-1", source: "ui", code: "CAB-P25", direction: "in", qty: 3, locationId: "loc" },
      "manager",
    );
    const second = ingestScan(
      db,
      { eventId: "evt-1", source: "ui", code: "CAB-P25", direction: "in", qty: 3, locationId: "loc" },
      "manager",
    );
    expect(first.status).toBe("accepted");
    expect(second.idempotent).toBe(true);
    expect(second.movement_id).toBe(first.movement_id);
    expect(db.select().from(stockBalances).where(eq(stockBalances.skuId, "CAB-P25")).get()?.qtyOnHand).toBe(3);
  });

  it("неизвестный код скана отклоняется и запоминается", () => {
    const db = setup();
    const result = ingestScan(
      db,
      { eventId: "evt-x", source: "gate", code: "НЕТ-ТАКОГО", direction: "in", qty: 1 },
      "manager",
    );
    expect(result.status).toBe("rejected");
    const replay = ingestScan(
      db,
      { eventId: "evt-x", source: "gate", code: "НЕТ-ТАКОГО", direction: "in", qty: 1 },
      "manager",
    );
    expect(replay.idempotent).toBe(true);
    expect(replay.status).toBe("rejected");
  });
});
