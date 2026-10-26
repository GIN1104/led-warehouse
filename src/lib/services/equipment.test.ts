import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { applyMovement, createOrder } from "@/lib/services/ledger";
import {
  addEquipmentItem,
  deleteEquipmentItem,
  importEquipmentReserved,
  listEquipmentHistory,
  listEquipmentItems,
  listEquipmentFamilyAggregates,
  listEquipmentSkuAggregates,
  setEquipmentSkuBuckets,
  setEquipmentStatus,
  sortEquipmentItems,
  transitionEquipmentQty,
  updateEquipmentItem,
} from "@/lib/services/equipment";
import { addSkuVariant, createProductFamily } from "@/lib/services/catalog-hierarchy";
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

  it("импорт HE имён → русские SKU и стабильный code при повторном RU", () => {
    const db = setup();
    const he = importEquipmentReserved(
      db,
      parseMapperCsv("שם,כמות,external_id\nמסך,3,eq-he-1\nמחשב,1,eq-he-1\n"),
      "wh",
    );
    expect(he.skusCreated).toBe(2);
    expect(he.items.map((row) => row.skuName).sort()).toEqual(["Компьютер", "Экран"]);
    const screenCode = he.items.find((row) => row.skuName === "Экран")?.skuCode;
    expect(screenCode).toBeTruthy();

    const ruAgain = importEquipmentReserved(
      db,
      parseMapperCsv("название,количество,external_id\nЭкран,5,eq-he-1\n"),
      "wh",
    );
    expect(ruAgain.skusCreated).toBe(0);
    expect(ruAgain.updated).toBe(1);
    expect(ruAgain.items[0]?.skuCode).toBe(screenCode);
    expect(ruAgain.items[0]?.skuName).toBe("Экран");
    expect(ruAgain.items[0]?.qty).toBe(5);
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

  it("обновляет qty и имя SKU, удаляет строку", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 8, note: "полка" }, "wh");
    const updated = updateEquipmentItem(db, item.id, { qty: 12, skuName: "Кабинет P2.5 HD" }, "wh");
    expect(updated.qty).toBe(12);
    expect(updated.skuName).toBe("Кабинет P2.5 HD");
    expect(updated.skuCode).toBe("CAB-P25");
    const history = listEquipmentHistory(db, item.id);
    expect(history.some((entry) => entry.note.includes("qty → 12"))).toBe(true);

    deleteEquipmentItem(db, item.id, "wh");
    expect(listEquipmentItems(db, { id: item.id })).toHaveLength(0);
    expect(listEquipmentHistory(db, item.id)).toHaveLength(0);
  });

  it("update с недопустимым переходом статуса падает", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 2, status: "available" }, "wh");
    expect(() => updateEquipmentItem(db, item.id, { status: "available" }, "wh")).not.toThrow();
    expect(() => updateEquipmentItem(db, item.id, { qty: 0 }, "wh")).toThrow(/больше нуля/);
  });

  it("импорт после ручного update qty не ломается", () => {
    const db = setup();
    const draft = parseMapperCsv(
      "code,qty,customer,start,end,external_id\nCAB-P25,5,Зал,2026-10-10,2026-10-12,eq-crud\n",
    );
    const first = importEquipmentReserved(db, draft, "wh");
    updateEquipmentItem(db, first.items[0]!.id, { qty: 9 }, "wh");
    const again = importEquipmentReserved(db, draft, "wh");
    expect(again.updated).toBe(1);
    expect(again.items[0]?.qty).toBe(5);
    expect(listEquipmentItems(db).filter((row) => row.externalRef === "eq-crud")).toHaveLength(1);
  });

  it("частичный ремонт: qty в in_repair, остаток остаётся available", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 80, status: "available" }, "wh");
    const result = transitionEquipmentQty(db, item.id, "in_repair", 2, "wh", "панель треснула");
    expect(result.split).toBe(true);
    expect(result.source.qty).toBe(78);
    expect(result.source.status).toBe("available");
    expect(result.moved.qty).toBe(2);
    expect(result.moved.status).toBe("in_repair");
    expect(result.moved.id).not.toBe(item.id);

    const full = transitionEquipmentQty(db, result.source.id, "needs_repair", 78, "wh");
    expect(full.split).toBe(false);
    expect(full.moved.status).toBe("needs_repair");
    expect(full.moved.qty).toBe(78);
  });

  it("частичный переход отклоняет qty > строки и 0", () => {
    const db = setup();
    const item = addEquipmentItem(db, { skuId: "CAB-P25", qty: 10 }, "wh");
    expect(() => transitionEquipmentQty(db, item.id, "in_repair", 11, "wh")).toThrow(/больше/);
    expect(() => transitionEquipmentQty(db, item.id, "in_repair", 0, "wh")).toThrow(/больше нуля/);
  });

  it("агрегат по SKU: всего / склад / в работе со ссылкой / ремонт", () => {
    const db = setup();
    addEquipmentItem(db, { skuId: "CAB-P25", qty: 30, status: "available" }, "wh");
    const reserved = addEquipmentItem(
      db,
      { skuId: "CAB-P25", qty: 48, status: "reserved", customerName: "Сцена Про" },
      "wh",
    );
    const order = createOrder(
      db,
      {
        customerName: "Сцена Про",
        startDate: "2026-10-20",
        endDate: "2026-10-22",
        notes: "",
        lines: [{ skuId: "CAB-P25", qty: 1 }],
      },
      "wh",
    );
    db.run(`UPDATE equipment_items SET order_id = ? WHERE id = ?`, [order.orderId, reserved.id]);
    addEquipmentItem(db, { skuId: "CAB-P25", qty: 2, status: "in_repair" }, "wh");

    const aggs = listEquipmentSkuAggregates(db);
    const cab = aggs.find((row) => row.skuCode === "CAB-P25");
    expect(cab).toBeTruthy();
    expect(cab!.total).toBe(80);
    expect(cab!.onHand).toBe(30);
    expect(cab!.inUse).toBe(48);
    expect(cab!.inRepair).toBe(2);
    expect(cab!.deployments).toHaveLength(1);
    expect(cab!.deployments[0]?.orderId).toBe(order.orderId);
    expect(cab!.deployments[0]?.label).toBe("Сцена Про");
  });

  it("сводка редактирует корзины: всего = склад + работа + ремонт", () => {
    const db = setup();
    addEquipmentItem(db, { skuId: "CAB-P25", qty: 80, status: "available" }, "wh");
    const updated = setEquipmentSkuBuckets(db, "CAB-P25", { onHand: 30, inUse: 48, inRepair: 2 }, "wh");
    expect(updated.total).toBe(80);
    expect(updated.onHand).toBe(30);
    expect(updated.inUse).toBe(48);
    expect(updated.inRepair).toBe(2);
    expect(updated.onHand + updated.inUse + updated.inRepair).toBe(updated.total);

    const again = setEquipmentSkuBuckets(db, "CAB-P25", { onHand: 28, inUse: 48, inRepair: 4 }, "wh");
    expect(again.onHand).toBe(28);
    expect(again.inRepair).toBe(4);
    expect(again.total).toBe(80);
  });

  it("сводка отклоняет отрицательные qty", () => {
    const db = setup();
    expect(() => setEquipmentSkuBuckets(db, "CAB-P25", { onHand: -1, inUse: 0, inRepair: 0 }, "wh")).toThrow(
      /≥ 0/,
    );
  });

  it("группирует сводку: группа → подгруппы", () => {
    const db = setup();
    const family = createProductFamily(db, "Телевизор", "wh");
    const tv32 = addSkuVariant(db, { familyId: family.id, name: 'TV 32"' }, "wh");
    const tv40 = addSkuVariant(db, { familyId: family.id, name: 'TV 40"' }, "wh");
    addEquipmentItem(db, { skuId: tv32.id, qty: 5, status: "available" }, "wh");
    addEquipmentItem(db, { skuId: tv40.id, qty: 3, status: "reserved" }, "wh");

    const groups = listEquipmentFamilyAggregates(db);
    const tv = groups.find((row) => row.familyId === family.id);
    expect(tv).toBeTruthy();
    expect(tv!.skus.map((s) => s.skuCode).sort()).toEqual(["TV-32", "TV-40"]);
    expect(tv!.total).toBe(8);
    expect(tv!.onHand).toBe(5);
    expect(tv!.inUse).toBe(3);
  });
});
