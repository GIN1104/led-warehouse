import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import {
  addKitChecklistItem,
  createKitGroup,
  createKitSubtype,
  createKitUnit,
  listKitTree,
  removeKitChecklistItem,
  removeKitGroup,
  seedDefaultKitsIfEmpty,
} from "@/lib/services/kits";

describe("комплекты (kits)", () => {
  it("строит иерархию группа → подтип → экземпляр → checklist", () => {
    const db = createDb();
    // migrate уже сеет демо — очистим для чистого теста
    for (const row of listKitTree(db)) removeKitGroup(db, row.id);

    const group = createKitGroup(db, "Компьютер");
    const subtype = createKitSubtype(db, group.id, "Laptop");
    const unit = createKitUnit(db, subtype.id, "№1");
    addKitChecklistItem(db, unit.id, { label: "HDMI", qty: 2 });
    addKitChecklistItem(db, unit.id, { label: "DVI-HDMI", qty: 1 });

    const tree = listKitTree(db);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Компьютер");
    expect(tree[0]?.subtypes[0]?.name).toBe("Laptop");
    expect(tree[0]?.subtypes[0]?.units[0]?.label).toBe("№1");
    expect(tree[0]?.subtypes[0]?.units[0]?.items.map((i) => `${i.label}×${i.qty}`)).toEqual([
      "HDMI×2",
      "DVI-HDMI×1",
    ]);
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
    // migrate уже вызвал seed — дерево не пустое
    const before = listKitTree(db);
    expect(before.some((g) => g.name === "Компьютер")).toBe(true);
    seedDefaultKitsIfEmpty(db);
    expect(listKitTree(db)).toHaveLength(before.length);

    const laptop = before.find((g) => g.name === "Компьютер")?.subtypes.find((s) => s.name === "Laptop");
    expect(laptop?.units.map((u) => u.label)).toEqual(["№1", "№2", "№3"]);
    expect(laptop?.units[0]?.items.some((i) => i.label === "HDMI" && i.qty === 2)).toBe(true);
  });
});
