import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { applyMovement } from "@/lib/services/ledger";
import {
  addEquipmentItem,
  importEquipmentReserved,
  listEquipmentHistory,
  listEquipmentItems,
  setEquipmentStatus,
  sortEquipmentItems,
} from "@/lib/services/equipment";
import { parseMapperCsv } from "@/lib/services/mapper-sheet";

function setup() {
  const db = createDb();
  db.run(`INSERT INTO users (id, name, role) VALUES ('wh', 'Алексей', 'warehouse')`);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc', 'Склад', 'warehouse', NULL)`);
  db.run(
    `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES ('CAB-P25', 'CAB-P25', 'Кабинет', 'Кабинеты', 'шт', 'quantity', '')`,
  );
  db.run(
    `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES ('CTL-NOVA', 'CTL-NOVA', 'Контроллер', 'Контроллеры', 'шт', 'quantity', '')`,
  );
  applyMovement(db, { skuId: "CAB-P25", locationId: "loc", type: "in", qty: 40, reason: "тест" }, "wh");
  return db;
}

describe("оборудование: статусы и импорт", () => {
  it("добавляет вручную как available и пишет историю", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 8, locationId: "loc", note: "полка A" }, "wh");
    expect(item.status).toBe("available");
    expect(item.qty).toBe(8);
    const history = listEquipmentHistory(db, item.id);
    expect(history[0]?.toStatus).toBe("available");
    expect(history[0]?.fromStatus).toBeNull();
  });

  it("импорт mapper ставит reserved и обновляет без дубля", () => {
    const db = setup();
    const draft = parseMapperCsv(
      "code,qty,customer,start,end,external_id\nCAB-P25,12,Сцена Про,2026-10-10,2026-10-12,eq-1\n",
    );
    const first = importEquipmentReserved(db, draft, "wh");
    expect(first.created).toBe(1);
    expect(first.updated).toBe(0);
    expect(first.items[0]?.status).toBe("reserved");
    expect(first.items[0]?.customerName).toBe("Сцена Про");

    const again = importEquipmentReserved(
      db,
      parseMapperCsv("code,qty,customer,start,end,external_id\nCAB-P25,15,Сцена Про,2026-10-10,2026-10-12,eq-1\n"),
      "wh",
    );
    expect(again.created).toBe(0);
    expect(again.updated).toBe(1);
    expect(listEquipmentItems(db).filter((row) => row.status === "reserved")).toHaveLength(1);
    expect(again.items[0]?.qty).toBe(15);
  });

  it("импорт name+qty создаёт SKU со стабильным code и ставит reserved", () => {
    const db = setup();
    const draft = parseMapperCsv(
      'название,количество,категория,заказчик,external_id\n"TV 32""",4,Телевизор,Зал A,eq-name-1\n"Телевизор 40""",2,Телевизор,Зал A,eq-name-1\n',
    );
    const first = importEquipmentReserved(db, draft, "wh");
    expect(first.created).toBe(2);
    expect(first.skusCreated).toBe(2);
    expect(first.items.map((row) => row.skuCode).sort()).toEqual(["TV-32", "TV-40"]);

    const again = importEquipmentReserved(
      db,
      parseMapperCsv('название,количество,категория,заказчик,external_id\n"  tv  32""",6,Телевизор,Зал A,eq-name-1\n'),
      "wh",
    );
    expect(again.skusCreated).toBe(0);
    expect(again.updated).toBe(1);
    expect(again.items[0]?.skuCode).toBe("TV-32");
    expect(again.items[0]?.qty).toBe(6);
  });

  it("вручную: reserved → checked_out → needs_repair → in_repair → available", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 4, status: "reserved" }, "wh");
    setEquipmentStatus(db, item.id, "checked_out", "wh", "вышло со склада");
    setEquipmentStatus(db, item.id, "needs_repair", "wh");
    setEquipmentStatus(db, item.id, "in_repair", "wh");
    const back = setEquipmentStatus(db, item.id, "available", "wh", "починили");
    expect(back.status).toBe("available");
    expect(listEquipmentHistory(db, item.id).length).toBeGreaterThanOrEqual(5);
  });

  it("сортирует по коду и количеству", () => {
    const db = setup();
    addEquipmentItem(db, { skuId: "CTL-NOVA", qty: 2 }, "wh");
    addEquipmentItem(db, { skuId: "CAB-P25", qty: 10 }, "wh");
    const rows = listEquipmentItems(db);
    const byCode = sortEquipmentItems(rows, "code", "asc");
    expect(byCode.map((row) => row.skuCode)).toEqual(["CAB-P25", "CTL-NOVA"]);
    const byQty = sortEquipmentItems(rows, "qty", "desc");
    expect(byQty[0]?.qty).toBe(10);
  });
});
