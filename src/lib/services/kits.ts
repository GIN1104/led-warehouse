import { DomainError } from "@/lib/domain/errors";
import { normalizeEquipmentName } from "@/lib/domain/sku-code";
import { newId, type Sql } from "@/lib/db/sql";
import { addSkuVariant, findOrCreateFamily } from "@/lib/services/catalog-hierarchy";

export type KitChecklistItem = {
  id: string;
  unitId: string;
  label: string;
  qty: number;
  sortOrder: number;
};

export type KitUnit = {
  id: string;
  subtypeId: string;
  label: string;
  sortOrder: number;
  items: KitChecklistItem[];
};

export type KitSubtype = {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
  skuId: string | null;
  units: KitUnit[];
};

export type KitGroup = {
  id: string;
  name: string;
  sortOrder: number;
  familyId: string | null;
  subtypes: KitSubtype[];
};

function assertLabel(raw: string, what: string): string {
  const next = raw.trim();
  if (!next || next.length > 80) throw new DomainError(`Укажите ${what}`);
  return next;
}

function assertQty(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1) throw new DomainError("Количество в комплекте должно быть целым и ≥ 1");
  return raw;
}

function replaceLeptop(value: string): string {
  return value.replace(/leptop/gi, "Laptop");
}

export function listKitTree(db: Sql): KitGroup[] {
  const groups = db.all<{ id: string; name: string; sortOrder: number; familyId: string | null }>(
    `SELECT id, name, sort_order AS sortOrder, family_id AS familyId
     FROM kit_groups ORDER BY sort_order ASC, name ASC`,
  );
  const subtypes = db.all<{
    id: string;
    groupId: string;
    name: string;
    sortOrder: number;
    skuId: string | null;
  }>(
    `SELECT id, group_id AS groupId, name, sort_order AS sortOrder, sku_id AS skuId
     FROM kit_subtypes ORDER BY sort_order ASC, name ASC`,
  );
  const units = db.all<{ id: string; subtypeId: string; label: string; sortOrder: number }>(
    `SELECT id, subtype_id AS subtypeId, label, sort_order AS sortOrder FROM kit_units ORDER BY sort_order ASC, label ASC`,
  );
  const items = db.all<{ id: string; unitId: string; label: string; qty: number; sortOrder: number }>(
    `SELECT id, unit_id AS unitId, label, qty, sort_order AS sortOrder
     FROM kit_checklist_items ORDER BY sort_order ASC, label ASC`,
  );

  const itemsByUnit = new Map<string, KitChecklistItem[]>();
  for (const item of items) {
    const list = itemsByUnit.get(item.unitId) ?? [];
    list.push(item);
    itemsByUnit.set(item.unitId, list);
  }
  const unitsBySubtype = new Map<string, KitUnit[]>();
  for (const unit of units) {
    const list = unitsBySubtype.get(unit.subtypeId) ?? [];
    list.push({ ...unit, items: itemsByUnit.get(unit.id) ?? [] });
    unitsBySubtype.set(unit.subtypeId, list);
  }
  const subtypesByGroup = new Map<string, KitSubtype[]>();
  for (const subtype of subtypes) {
    const list = subtypesByGroup.get(subtype.groupId) ?? [];
    list.push({ ...subtype, units: unitsBySubtype.get(subtype.id) ?? [] });
    subtypesByGroup.set(subtype.groupId, list);
  }
  return groups.map((group) => ({
    ...group,
    subtypes: subtypesByGroup.get(group.id) ?? [],
  }));
}

/** Подтип комплекта по SKU — для nested-строк в сводке «Всё оборудование». */
export function listKitSubtypesBySkuId(db: Sql): Map<string, KitSubtype & { groupName: string }> {
  const tree = listKitTree(db);
  const map = new Map<string, KitSubtype & { groupName: string }>();
  for (const group of tree) {
    for (const subtype of group.subtypes) {
      if (!subtype.skuId) continue;
      map.set(subtype.skuId, { ...subtype, groupName: group.name });
    }
  }
  return map;
}

function linkGroupFamily(db: Sql, groupId: string, name: string): string {
  const family = findOrCreateFamily(db, name);
  db.run(`UPDATE kit_groups SET family_id = ? WHERE id = ?`, [family.id, groupId]);
  return family.id;
}

function linkSubtypeSku(db: Sql, subtypeId: string, groupId: string, name: string): string {
  const group = db.get<{ familyId: string | null; name: string }>(
    `SELECT family_id AS familyId, name FROM kit_groups WHERE id = ?`,
    [groupId],
  );
  if (!group) throw new DomainError("Комплект не найден");
  let familyId = group.familyId;
  if (!familyId) familyId = linkGroupFamily(db, groupId, group.name);
  const sku = addSkuVariant(db, { familyId, name }, "kit-sync");
  db.run(`UPDATE kit_subtypes SET sku_id = ?, name = ? WHERE id = ?`, [sku.id, sku.name, subtypeId]);
  return sku.id;
}

export function createKitGroup(db: Sql, name: string): KitGroup {
  const next = replaceLeptop(assertLabel(name, "название комплекта"));
  const max =
    db.get<{ value: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_groups`)?.value ?? -1;
  const id = `kitg_${newId().replace(/-/g, "").slice(0, 12)}`;
  const now = Date.now();
  const familyId = findOrCreateFamily(db, next).id;
  db.run(`INSERT INTO kit_groups (id, name, sort_order, created_at, family_id) VALUES (?, ?, ?, ?, ?)`, [
    id,
    next,
    max + 1,
    now,
    familyId,
  ]);
  return { id, name: next, sortOrder: max + 1, familyId, subtypes: [] };
}

export function createKitSubtype(db: Sql, groupId: string, name: string): KitSubtype {
  const group = db.get<{ id: string; familyId: string | null; name: string }>(
    `SELECT id, family_id AS familyId, name FROM kit_groups WHERE id = ?`,
    [groupId],
  );
  if (!group) throw new DomainError("Комплект не найден");
  const next = replaceLeptop(assertLabel(name, "название подтипа"));
  const max =
    db.get<{ value: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_subtypes WHERE group_id = ?`,
      [groupId],
    )?.value ?? -1;
  const id = `kits_${newId().replace(/-/g, "").slice(0, 12)}`;
  let familyId = group.familyId;
  if (!familyId) familyId = linkGroupFamily(db, groupId, group.name);
  const sku = addSkuVariant(db, { familyId, name: next }, "kit-sync");
  db.run(
    `INSERT INTO kit_subtypes (id, group_id, name, sort_order, created_at, sku_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, groupId, sku.name, max + 1, Date.now(), sku.id],
  );
  return { id, groupId, name: sku.name, sortOrder: max + 1, skuId: sku.id, units: [] };
}

export function createKitUnit(db: Sql, subtypeId: string, label: string): KitUnit {
  const subtype = db.get<{ id: string }>(`SELECT id FROM kit_subtypes WHERE id = ?`, [subtypeId]);
  if (!subtype) throw new DomainError("Подтип комплекта не найден");
  const next = replaceLeptop(assertLabel(label, "номер экземпляра"));
  const max =
    db.get<{ value: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_units WHERE subtype_id = ?`,
      [subtypeId],
    )?.value ?? -1;
  const id = `kitu_${newId().replace(/-/g, "").slice(0, 12)}`;
  db.run(`INSERT INTO kit_units (id, subtype_id, label, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`, [
    id,
    subtypeId,
    next,
    max + 1,
    Date.now(),
  ]);
  return { id, subtypeId, label: next, sortOrder: max + 1, items: [] };
}

export function addKitChecklistItem(
  db: Sql,
  unitId: string,
  input: { label: string; qty?: number },
): KitChecklistItem {
  const unit = db.get<{ id: string }>(`SELECT id FROM kit_units WHERE id = ?`, [unitId]);
  if (!unit) throw new DomainError("Экземпляр комплекта не найден");
  const label = replaceLeptop(assertLabel(input.label, "название содержимого"));
  const qty = assertQty(input.qty ?? 1);
  const max =
    db.get<{ value: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_checklist_items WHERE unit_id = ?`,
      [unitId],
    )?.value ?? -1;
  const id = `kitc_${newId().replace(/-/g, "").slice(0, 12)}`;
  db.run(
    `INSERT INTO kit_checklist_items (id, unit_id, label, qty, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, unitId, label, qty, max + 1, Date.now()],
  );
  return { id, unitId, label, qty, sortOrder: max + 1 };
}

export function removeKitChecklistItem(db: Sql, itemId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM kit_checklist_items WHERE id = ?`, [itemId]);
  if (!row) throw new DomainError("Строка комплектации не найдена");
  db.run(`DELETE FROM kit_checklist_items WHERE id = ?`, [itemId]);
}

export function removeKitUnit(db: Sql, unitId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM kit_units WHERE id = ?`, [unitId]);
  if (!row) throw new DomainError("Экземпляр комплекта не найден");
  db.run(`DELETE FROM kit_checklist_items WHERE unit_id = ?`, [unitId]);
  db.run(`DELETE FROM kit_units WHERE id = ?`, [unitId]);
}

export function removeKitSubtype(db: Sql, subtypeId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM kit_subtypes WHERE id = ?`, [subtypeId]);
  if (!row) throw new DomainError("Подтип комплекта не найден");
  const units = db.all<{ id: string }>(`SELECT id FROM kit_units WHERE subtype_id = ?`, [subtypeId]);
  for (const unit of units) removeKitUnit(db, unit.id);
  db.run(`DELETE FROM kit_subtypes WHERE id = ?`, [subtypeId]);
}

export function removeKitGroup(db: Sql, groupId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM kit_groups WHERE id = ?`, [groupId]);
  if (!row) throw new DomainError("Комплект не найден");
  const subtypes = db.all<{ id: string }>(`SELECT id FROM kit_subtypes WHERE group_id = ?`, [groupId]);
  for (const subtype of subtypes) removeKitSubtype(db, subtype.id);
  db.run(`DELETE FROM kit_groups WHERE id = ?`, [groupId]);
}

/** LEPTOP/Leptop → Laptop в комплектах и в сводке (product_families / skus). */
export function fixKitLeptopTypo(db: Sql): number {
  let fixed = 0;
  const kitTables: { table: string; column: string }[] = [
    { table: "kit_groups", column: "name" },
    { table: "kit_subtypes", column: "name" },
    { table: "kit_units", column: "label" },
    { table: "kit_checklist_items", column: "label" },
  ];
  for (const { table, column } of kitTables) {
    const rows = db.all<{ id: string; value: string }>(
      `SELECT id, ${column} AS value FROM ${table} WHERE lower(${column}) LIKE '%leptop%'`,
    );
    for (const row of rows) {
      const next = replaceLeptop(row.value);
      if (next === row.value) continue;
      db.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [next, row.id]);
      fixed += 1;
    }
  }

  const families = db.all<{ id: string; name: string }>(
    `SELECT id, name FROM product_families WHERE lower(name) LIKE '%leptop%'`,
  );
  for (const row of families) {
    const next = replaceLeptop(row.name);
    if (next === row.name) continue;
    db.run(`UPDATE product_families SET name = ? WHERE id = ?`, [next, row.id]);
    db.run(`UPDATE skus SET category = ? WHERE family_id = ?`, [next, row.id]);
    fixed += 1;
  }

  const skus = db.all<{ id: string; name: string }>(
    `SELECT id, name FROM skus WHERE lower(name) LIKE '%leptop%' OR lower(code) LIKE '%leptop%'`,
  );
  for (const row of skus) {
    const nextName = replaceLeptop(row.name);
    const nameKey = normalizeEquipmentName(nextName);
    db.run(`UPDATE skus SET name = ?, name_key = ? WHERE id = ?`, [nextName, nameKey, row.id]);
    fixed += 1;
  }
  return fixed;
}

/** Привязать существующие комплекты к группам/SKU сводки. */
export function ensureKitsLinkedToCatalog(db: Sql): void {
  const groups = db.all<{ id: string; name: string; familyId: string | null }>(
    `SELECT id, name, family_id AS familyId FROM kit_groups`,
  );
  for (const group of groups) {
    if (!group.familyId) linkGroupFamily(db, group.id, group.name);
  }
  const subtypes = db.all<{ id: string; groupId: string; name: string; skuId: string | null }>(
    `SELECT id, group_id AS groupId, name, sku_id AS skuId FROM kit_subtypes`,
  );
  for (const subtype of subtypes) {
    if (!subtype.skuId) linkSubtypeSku(db, subtype.id, subtype.groupId, subtype.name);
  }
}

/** Демо-иерархия Компьютер → Laptop → №1/2/3 с checklist, если таблица пуста. */
export function seedDefaultKitsIfEmpty(db: Sql): void {
  fixKitLeptopTypo(db);
  const count = db.get<{ value: number }>(`SELECT COUNT(*) AS value FROM kit_groups`);
  if ((count?.value ?? 0) > 0) {
    ensureKitsLinkedToCatalog(db);
    return;
  }

  const group = createKitGroup(db, "Компьютер");
  const subtype = createKitSubtype(db, group.id, "Laptop");
  for (const label of ["№1", "№2", "№3"]) {
    const unit = createKitUnit(db, subtype.id, label);
    addKitChecklistItem(db, unit.id, { label: "HDMI", qty: 2 });
    addKitChecklistItem(db, unit.id, { label: "DVI-HDMI", qty: 1 });
  }
}
