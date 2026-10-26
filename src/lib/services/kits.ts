import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";

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
  units: KitUnit[];
};

export type KitGroup = {
  id: string;
  name: string;
  sortOrder: number;
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

export function listKitTree(db: Sql): KitGroup[] {
  const groups = db.all<{ id: string; name: string; sortOrder: number }>(
    `SELECT id, name, sort_order AS sortOrder FROM kit_groups ORDER BY sort_order ASC, name ASC`,
  );
  const subtypes = db.all<{ id: string; groupId: string; name: string; sortOrder: number }>(
    `SELECT id, group_id AS groupId, name, sort_order AS sortOrder FROM kit_subtypes ORDER BY sort_order ASC, name ASC`,
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

export function createKitGroup(db: Sql, name: string): KitGroup {
  const next = assertLabel(name, "название комплекта");
  const max =
    db.get<{ value: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_groups`)?.value ?? -1;
  const id = `kitg_${newId().replace(/-/g, "").slice(0, 12)}`;
  const now = Date.now();
  db.run(`INSERT INTO kit_groups (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    next,
    max + 1,
    now,
  ]);
  return { id, name: next, sortOrder: max + 1, subtypes: [] };
}

export function createKitSubtype(db: Sql, groupId: string, name: string): KitSubtype {
  const group = db.get<{ id: string }>(`SELECT id FROM kit_groups WHERE id = ?`, [groupId]);
  if (!group) throw new DomainError("Комплект не найден");
  const next = assertLabel(name, "название подтипа");
  const max =
    db.get<{ value: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS value FROM kit_subtypes WHERE group_id = ?`,
      [groupId],
    )?.value ?? -1;
  const id = `kits_${newId().replace(/-/g, "").slice(0, 12)}`;
  db.run(`INSERT INTO kit_subtypes (id, group_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`, [
    id,
    groupId,
    next,
    max + 1,
    Date.now(),
  ]);
  return { id, groupId, name: next, sortOrder: max + 1, units: [] };
}

export function createKitUnit(db: Sql, subtypeId: string, label: string): KitUnit {
  const subtype = db.get<{ id: string }>(`SELECT id FROM kit_subtypes WHERE id = ?`, [subtypeId]);
  if (!subtype) throw new DomainError("Подтип комплекта не найден");
  const next = assertLabel(label, "номер экземпляра");
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
  const label = assertLabel(input.label, "название содержимого");
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

/** Исправляет опечатку LEPTOP/Leptop → Laptop в уже сохранённых комплектах. */
export function fixKitLeptopTypo(db: Sql): number {
  let fixed = 0;
  const tables: { table: string; column: string }[] = [
    { table: "kit_groups", column: "name" },
    { table: "kit_subtypes", column: "name" },
    { table: "kit_units", column: "label" },
    { table: "kit_checklist_items", column: "label" },
  ];
  for (const { table, column } of tables) {
    const rows = db.all<{ id: string; value: string }>(
      `SELECT id, ${column} AS value FROM ${table} WHERE lower(${column}) LIKE '%leptop%'`,
    );
    for (const row of rows) {
      const next = row.value.replace(/leptop/gi, "Laptop");
      if (next === row.value) continue;
      db.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [next, row.id]);
      fixed += 1;
    }
  }
  return fixed;
}

/** Демо-иерархия Компьютер → Laptop → №1/2/3 с checklist, если таблица пуста. */
export function seedDefaultKitsIfEmpty(db: Sql): void {
  fixKitLeptopTypo(db);
  const count = db.get<{ value: number }>(`SELECT COUNT(*) AS value FROM kit_groups`);
  if ((count?.value ?? 0) > 0) return;

  const group = createKitGroup(db, "Компьютер");
  const subtype = createKitSubtype(db, group.id, "Laptop");
  for (const label of ["№1", "№2", "№3"]) {
    const unit = createKitUnit(db, subtype.id, label);
    addKitChecklistItem(db, unit.id, { label: "HDMI", qty: 2 });
    addKitChecklistItem(db, unit.id, { label: "DVI-HDMI", qty: 1 });
  }
}
