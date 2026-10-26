import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import {
  addSkuVariant,
  assignSkuToFamily,
  createProductFamily,
  findOrCreateSkuByName,
  guessFamilyName,
  listFamilyTree,
  moveFamily,
  moveSkuInFamily,
  renameProductFamily,
  renameSku,
} from "@/lib/services/catalog-hierarchy";
import { listEquipmentFamilyAggregates } from "@/lib/services/equipment";

function setup() {
  const db = createDb();
  db.run(`INSERT INTO users (id, name, role) VALUES ('wh', 'Алексей', 'warehouse')`);
  return db;
}

describe("иерархия групп и SKU", () => {
  it("создаёт группу и варианты с авто-code", () => {
    const db = setup();
    const family = createProductFamily(db, "Телевизор", "wh");
    const a = addSkuVariant(db, { familyId: family.id, name: 'TV 32"' }, "wh");
    const b = addSkuVariant(db, { familyId: family.id, name: "Телевизор 40\"" }, "wh");
    expect(a.code).toBe("TV-32");
    expect(b.code).toBe("TV-40");
    const tree = listFamilyTree(db);
    const node = tree.find((row) => row.id === family.id);
    expect(node?.skus.map((sku) => sku.code)).toEqual(["TV-32", "TV-40"]);
  });

  it("findOrCreateSkuByName стабилен по нормализованному имени", () => {
    const db = setup();
    const first = findOrCreateSkuByName(db, { name: 'TV 32"', category: "Телевизор" }, "wh");
    const second = findOrCreateSkuByName(db, { name: "  tv  32\" ", category: "Телевизор" }, "wh");
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(second.code).toBe(first.code);
  });

  it("сортирует варианты внутри группы", () => {
    const db = setup();
    const family = createProductFamily(db, "Телевизор", "wh");
    const a = addSkuVariant(db, { familyId: family.id, name: 'TV 32"' }, "wh");
    const b = addSkuVariant(db, { familyId: family.id, name: 'TV 50"' }, "wh");
    moveSkuInFamily(db, b.id, "up");
    const tree = listFamilyTree(db);
    const node = tree.find((row) => row.id === family.id);
    expect(node?.skus.map((sku) => sku.code)).toEqual(["TV-50", "TV-32"]);
    void a;
  });

  it("меняет порядок групп и сохраняет sort_order для сводки", () => {
    const db = setup();
    const cubes = createProductFamily(db, "Кубики", "wh");
    const processors = createProductFamily(db, "Процессоры", "wh");
    const sprites = createProductFamily(db, "Спрайты", "wh");
    addSkuVariant(db, { familyId: cubes.id, name: "Cube A" }, "wh");
    addSkuVariant(db, { familyId: processors.id, name: "CPU X" }, "wh");
    addSkuVariant(db, { familyId: sprites.id, name: "Sprite 1" }, "wh");

    expect(listFamilyTree(db).map((row) => row.name)).toEqual(["Кубики", "Процессоры", "Спрайты"]);

    moveFamily(db, processors.id, "up");
    expect(listFamilyTree(db).map((row) => row.name)).toEqual(["Процессоры", "Кубики", "Спрайты"]);

    moveFamily(db, sprites.id, "up");
    moveFamily(db, sprites.id, "up");
    expect(listFamilyTree(db).map((row) => row.name)).toEqual(["Спрайты", "Процессоры", "Кубики"]);

    const summary = listEquipmentFamilyAggregates(db).map((row) => row.familyName);
    expect(summary.slice(0, 3)).toEqual(["Спрайты", "Процессоры", "Кубики"]);
  });

  it("угадывает группу: кабинет → Кабинеты, не отдельная группа", () => {
    expect(guessFamilyName("Кабинет LED P3.9 1000×500")).toBe("Кабинеты");
    const db = setup();
    createProductFamily(db, "Кабинеты", "wh");
    const created = findOrCreateSkuByName(db, { name: "Кабинет LED P3.9 1000×500" }, "wh");
    expect(created.created).toBe(true);
    const tree = listFamilyTree(db);
    const cabinets = tree.find((row) => row.name === "Кабинеты");
    expect(cabinets?.skus.some((sku) => sku.id === created.id)).toBe(true);
    expect(tree.some((row) => row.name === "Кабинет LED P3.9 1000×500")).toBe(false);
  });

  it("переименовывает группу и SKU, переносит в другую группу", () => {
    const db = setup();
    const cabinets = createProductFamily(db, "Кабинеты", "wh");
    const cables = createProductFamily(db, "Кабели", "wh");
    const sku = addSkuVariant(db, { familyId: cabinets.id, name: "Кабинет LED P3.9 1000×500" }, "wh");
    renameProductFamily(db, cabinets.id, "LED Кабинеты", "wh");
    expect(listFamilyTree(db).find((row) => row.id === cabinets.id)?.name).toBe("LED Кабинеты");
    renameSku(db, sku.id, "Кабинет P3.9 1м", "wh");
    assignSkuToFamily(db, sku.id, cables.id, "wh");
    const tree = listFamilyTree(db);
    expect(tree.find((row) => row.id === cables.id)?.skus.map((s) => s.name)).toContain("Кабинет P3.9 1м");
    expect(tree.find((row) => row.id === cabinets.id)?.skus).toHaveLength(0);
  });
});
