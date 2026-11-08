import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { addEquipmentItem, setEquipmentStatus } from "@/lib/services/equipment";
import { applyMovement, createOrder, renameOrder } from "@/lib/services/ledger";
import { listOperationsHistory } from "@/lib/services/operations-history";

function setup() {
  const db = createDb();
  db.run(`INSERT INTO users (id, name, role) VALUES ('manager', 'Дмитрий', 'manager')`);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc', 'Склад', 'warehouse', NULL)`);
  db.run(
    `INSERT INTO skus (id, code, name, category, unit, track_mode, description)
     VALUES ('CAB-P25', 'CAB-P25', 'Кабинет', 'Кабинеты', 'шт', 'quantity', '')`,
  );
  return db;
}

describe("operations history", () => {
  it("собирает движения, оборудование и audit в хронологии", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 5, reason: "приход тест" }, "manager");
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 1, note: "юнит" }, "manager");
    setEquipmentStatus(db, item.id, "needs_repair", "manager", "флаг повреждения");
    const order = createOrder(
      db,
      {
        customerName: "Клиент",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
        lines: [{ skuId: "CAB-P25", qty: 1 }],
        createdAt: Date.now(),
      },
      "manager",
    );
    renameOrder(db, order.orderId, "Клиент Renamed", "manager");

    const rows = listOperationsHistory(db, { limit: 50 });
    expect(rows.some((row) => row.kind === "stock" && row.summary.includes("приход"))).toBe(true);
    expect(rows.some((row) => row.kind === "equipment" && row.subtype === "needs_repair")).toBe(true);
    expect(rows.some((row) => row.kind === "order" && row.subtype === "order.rename")).toBe(true);
    expect(rows.every((row, i, all) => i === 0 || all[i - 1]!.createdAt >= row.createdAt)).toBe(true);
  });

  it("фильтрует по kind и SKU", () => {
    const db = setup();
    applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 2, reason: "партия" }, "manager");
    createOrder(
      db,
      {
        customerName: "Клиент фильтр",
        startDate: "2026-11-01",
        endDate: "2026-11-02",
        lines: [{ skuId: "CAB-P25", qty: 1 }],
      },
      "manager",
    );

    const stockOnly = listOperationsHistory(db, { kind: "stock", query: "CAB-P25" });
    expect(stockOnly.length).toBeGreaterThan(0);
    expect(stockOnly.every((row) => row.kind === "stock")).toBe(true);

    const orderOnly = listOperationsHistory(db, { kind: "order" });
    expect(orderOnly.every((row) => row.kind === "order")).toBe(true);
  });
});
