import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { createProductFamily, listProductFamilies } from "@/lib/services/catalog-hierarchy";
import { listEquipmentFamilyAggregates } from "@/lib/services/equipment";
import {
  addKitChecklistItem,
  createKitGroup,
  createKitSubtype,
  createKitUnit,
  fixKitLeptopTypo,
  listKitSubtypesBySkuId,
  listKitTree,
  removeKitChecklistItem,
  removeKitGroup,
  seedDefaultKitsIfEmpty,
} from "@/lib/services/kits";

describe("комплекты (kits)", () => {
  it("строит иерархию и линкует SKU с кодом LAPTOP", () => {
    const db = createDb();
    for (const row of listKitTree(db)) removeKitGroup(db, row.id);

    const group = createKitGroup(db, "Компьютер");
    expect(group.familyId).toBeTruthy();
    const subtype = createKitSubtype(db, group.id, "Laptop");
    expect(subtype.skuId).toBeTruthy();
    expect(subtype.name).toBe("Laptop");
    const code = db.get<{ code: string }>(`SELECT code FROM skus WHERE id = ?`, [subtype.skuId!])?.code;
    expect(code).toBe("LAPTOP");
    expect(code).not.toMatch(/leptop/i);

    const unit = createKitUnit(db, subtype.id, "№1");
    addKitChecklistItem(db, unit.id, { label: "HDMI", qty: 2 });

    const bySku = listKitSubtypesBySkuId(db);
    expect(bySku.get(subtype.skuId!)?.name).toBe("Laptop");
    const family = listEquipmentFamilyAggregates(db).find((f) => f.familyName === "Компьютер");
    expect(family?.skus.some((s) => s.skuName === "Laptop" && s.skuCode === "LAPTOP")).toBe(true);
  });

  it("создаёт комплект под существующей группой (кабинеты)", () => {
    const db = createDb();
    const cabinets = listProductFamilies(db).find((f) => f.name === "Кабинеты") ?? createProductFamily(db, "Кабинеты", "wh");
    const group = createKitGroup(db, { familyId: cabinets.id });
    expect(group.familyId).toBe(cabinets.id);
    expect(group.name).toBe("Кабинеты");
    const subtype = createKitSubtype(db, group.id, "Flight kit");
    expect(subtype.skuId).toBeTruthy();
    const summary = listEquipmentFamilyAggregates(db).find((f) => f.familyId === cabinets.id);
    expect(summary?.skus.some((s) => s.skuId === subtype.skuId && s.skuName === "Flight kit")).toBe(true);
    expect(listKitSubtypesBySkuId(db).has(subtype.skuId!)).toBe(true);
  });

  it("удаляет строку комплектации и каскадит группу", () => {
    const db = createDb();
    for (const row of listKitTree(db)) removeKitGroup(db, row.id);

    const group = createKitGroup(db, "Кейс");
    const subtype = createKitSubtype(db, group.id, "Flight");
    const unit = createKitUnit(db, subtype.id, "A");
    const item = addKitChecklistItem(db, unit.id, { label: "Кабель", qty: 1 });
    removeKitChecklistItem(db, item.id);
    expect(listKitTree(db)[0]?.subtypes[0]?.units[0]?.items).toEqual([]);

    removeKitGroup(db, group.id);
    expect(listKitTree(db)).toEqual([]);
  });

  it("seedDefaultKitsIfEmpty кладёт Computer/Laptop №1–3 один раз", () => {
    const db = createDb();
    const before = listKitTree(db);
    expect(before.some((g) => g.name === "Компьютер")).toBe(true);
    seedDefaultKitsIfEmpty(db);
    expect(listKitTree(db)).toHaveLength(before.length);

    const laptop = before.find((g) => g.name === "Компьютер")?.subtypes.find((s) => s.name === "Laptop");
    expect(laptop?.skuId).toBeTruthy();
    expect(db.get<{ code: string }>(`SELECT code FROM skus WHERE id = ?`, [laptop!.skuId!])?.code).toBe("LAPTOP");
  });

  it("fixKitLeptopTypo чинит LEPTOP в name И code сводки", () => {
    const db = createDb();
    const laptopSku = db.get<{ id: string }>(`SELECT id FROM skus WHERE name = 'Laptop'`);
    expect(laptopSku).toBeTruthy();
    db.run(`UPDATE skus SET name = 'LEPTOP', code = 'LEPTOP', name_key = 'leptop_typo_tmp' WHERE id = ?`, [
      laptopSku!.id,
    ]);
    db.run(`UPDATE kit_subtypes SET name = 'LEPTOP' WHERE sku_id = ?`, [laptopSku!.id]);

    expect(fixKitLeptopTypo(db)).toBeGreaterThanOrEqual(1);

    const sku = db.get<{ name: string; code: string }>(`SELECT name, code FROM skus WHERE id = ?`, [laptopSku!.id]);
    expect(sku?.name).toBe("Laptop");
    expect(sku?.code).toBe("LAPTOP");
    expect(sku?.code).not.toMatch(/leptop/i);

    const summary = listEquipmentFamilyAggregates(db).find((f) => f.familyName === "Компьютер");
    const row = summary?.skus.find((s) => s.skuId === laptopSku!.id);
    expect(row?.skuCode).toBe("LAPTOP");
    expect(row?.skuName).toBe("Laptop");
  });
});
