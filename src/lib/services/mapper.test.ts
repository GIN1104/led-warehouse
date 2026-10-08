import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { applyMovement, ingestScan } from "@/lib/services/ledger";
import { importMapperOrder } from "@/lib/services/mapper";
import { parseMapperCsv } from "@/lib/services/mapper-sheet";
import { getOrderDetail } from "@/lib/services/queries";

function setup() {
  const db = createDb();
  db.run(`INSERT INTO users (id, name, role) VALUES ('manager', 'Дмитрий', 'manager')`);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc', 'Склад', 'warehouse', NULL)`);
  db.run(
    `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES ('CAB-P39', 'CAB-P39', 'Кабинет', 'Кабинеты', 'шт', 'quantity', '')`,
  );
  applyMovement(db, { skuId: "CAB-P39", locationId: "loc", type: "in", qty: 24, reason: "тест" }, "manager");
  return db;
}

describe("заказ mapper", () => {
  it("считает Excel в бронь и повтор не удваивает заказ", () => {
    const db = setup();
    const draft = parseMapperCsv("code,qty,customer,start,end,external_id\nCAB-P39,30,Тест проката,2026-10-08,2026-10-10,map-1\n");
    const first = importMapperOrder(db, draft);
    expect(first.idempotent).toBe(false);
    expect(first.shortages).toEqual([{ skuId: "CAB-P39", qty: 6 }]);
    expect(first.reserved).toEqual([{ code: "CAB-P39", qty: 24 }]);

    const second = importMapperOrder(db, draft);
    expect(second.idempotent).toBe(true);
    expect(second.orderId).toBe(first.orderId);
    expect(getOrderDetail(db, first.orderId)?.order.source).toBe("mapper");
  });

  it("рамка сканирования помечает бронь как вышедшую и не раздувает нехватку", () => {
    const db = setup();
    const created = importMapperOrder(db, {
      customerName: "Тест проката",
      startDate: "2026-10-08",
      endDate: "2026-10-10",
      externalId: "map-2",
      lines: [{ code: "CAB-P39", qty: 10 }],
    });
    const scan = ingestScan(
      db,
      {
        eventId: "gate-1",
        source: "gate",
        code: "CAB-P39",
        direction: "out",
        qty: 4,
        meta: { externalId: "map-2" },
      },
      "gate",
    );
    expect(scan.status).toBe("accepted");
    expect(scan.issued).toEqual([{ order_id: created.orderId, qty: 4 }]);
    const line = getOrderDetail(db, created.orderId)?.lines[0];
    expect(line?.qtyIssued).toBe(4);
    expect(line?.qtySoftReserved).toBe(6);
    expect(line?.qtyShortage).toBe(0);
    const onHand = db.get<{ qty: number }>(`SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = 'CAB-P39'`)?.qty;
    expect(onHand).toBe(20);
  });
});
