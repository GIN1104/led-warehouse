import { canonicalizeEquipmentName } from "@/lib/domain/he-ru-glossary";
import { generateStableSkuCode, normalizeEquipmentName } from "@/lib/domain/sku-code";
import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";

export type ProductFamilyRow = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: number;
};

export type FamilySkuRow = {
  id: string;
  code: string;
  name: string;
  nameKey: string;
  category: string;
  familyId: string | null;
  sortOrder: number;
  unit: string;
};

export type FamilyTreeNode = ProductFamilyRow & { skus: FamilySkuRow[] };

function takenCodes(db: Sql): Set<string> {
  return new Set(db.all<{ code: string }>(`SELECT code FROM skus`).map((row) => row.code.toUpperCase()));
}

/** Найти или создать группу (семейство) оборудования. */
export function findOrCreateFamily(db: Sql, name: string): ProductFamilyRow {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new DomainError("Укажите название группы");
  const existing = db.get<ProductFamilyRow>(
    `SELECT id, name, sort_order AS sortOrder, created_at AS createdAt FROM product_families WHERE lower(name) = lower(?)`,
    [trimmed],
  );
  if (existing) return existing;
  const now = Date.now();
  const maxSort = db.get<{ value: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS value FROM product_families`)?.value ?? -1;
  const id = newId();
  db.run(`INSERT INTO product_families (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    trimmed,
    maxSort + 1,
    now,
  ]);
  return { id, name: trimmed, sortOrder: maxSort + 1, createdAt: now };
}

export function createProductFamily(db: Sql, name: string, actor: string): ProductFamilyRow {
  void actor;
  return findOrCreateFamily(db, name);
}

export function listProductFamilies(db: Sql): ProductFamilyRow[] {
  return db.all<ProductFamilyRow>(
    `SELECT id, name, sort_order AS sortOrder, created_at AS createdAt FROM product_families ORDER BY sort_order ASC, name ASC`,
  );
}

export function listFamilyTree(db: Sql): FamilyTreeNode[] {
  const families = listProductFamilies(db);
  const skus = db.all<FamilySkuRow>(
    `SELECT id, code, name, COALESCE(name_key, '') AS nameKey, category,
            family_id AS familyId, COALESCE(sort_order, 0) AS sortOrder, unit
     FROM skus
     ORDER BY COALESCE(sort_order, 0) ASC, code ASC`,
  );
  const byFamily = new Map<string, FamilySkuRow[]>();
  const uncategorized: FamilySkuRow[] = [];
  for (const sku of skus) {
    if (sku.familyId) {
      const list = byFamily.get(sku.familyId) ?? [];
      list.push(sku);
      byFamily.set(sku.familyId, list);
    } else {
      uncategorized.push(sku);
    }
  }
  const tree: FamilyTreeNode[] = families.map((family) => ({
    ...family,
    skus: byFamily.get(family.id) ?? [],
  }));
  if (uncategorized.length > 0) {
    tree.push({
      id: "__uncategorized__",
      name: "Без группы",
      sortOrder: 9999,
      createdAt: 0,
      skus: uncategorized,
    });
  }
  return tree;
}

/**
 * Найти SKU по нормализованному имени или создать с авто-code.
 * Один и тот же name → один и тот же SKU/code.
 */
export function findOrCreateSkuByName(
  db: Sql,
  input: { name: string; category?: string; code?: string; unit?: string },
  actor: string,
): { id: string; code: string; name: string; created: boolean } {
  const name = canonicalizeEquipmentName(input.name.trim());
  if (name.length < 2) throw new DomainError("Укажите название");
  const nameKey = normalizeEquipmentName(name);

  const byKey = db.get<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM skus WHERE name_key = ?`,
    [nameKey],
  );
  if (byKey) return { ...byKey, created: false };

  if (input.code?.trim()) {
    const code = input.code.trim().toUpperCase();
    const byCode = db.get<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM skus WHERE upper(code) = ? OR upper(id) = ?`,
      [code, code],
    );
    if (byCode) {
      db.run(`UPDATE skus SET name_key = COALESCE(NULLIF(name_key, ''), ?) WHERE id = ?`, [nameKey, byCode.id]);
      return { ...byCode, created: false };
    }
  }

  let familyId: string | null = null;
  let category = (input.category ?? "").trim();
  if (category.length >= 2) {
    const family = findOrCreateFamily(db, category);
    familyId = family.id;
    category = family.name;
  } else {
    category = "Прочее";
  }

  const code = input.code?.trim().toUpperCase() || generateStableSkuCode(name, takenCodes(db));
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) {
    throw new DomainError("Код: латиница, цифры и дефис, от 2 до 32 символов");
  }
  const maxSort = (
    familyId
      ? db.get<{ value: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS value FROM skus WHERE family_id = ?`, [familyId])
      : db.get<{ value: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS value FROM skus WHERE family_id IS NULL`)
  )?.value ?? -1;
  const id = newId();
  try {
    db.run(
      `INSERT INTO skus (id, code, name, category, unit, track_mode, description, family_id, name_key, sort_order)
       VALUES (?, ?, ?, ?, ?, 'quantity', '', ?, ?, ?)`,
      [id, code, name, category, input.unit?.trim() || "шт", familyId, nameKey, maxSort + 1],
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/unique|UNIQUE/i.test(msg)) {
      const again = db.get<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM skus WHERE name_key = ? OR upper(code) = ?`,
        [nameKey, code],
      );
      if (again) return { ...again, created: false };
      throw new DomainError("Такой код номенклатуры уже есть");
    }
    throw error;
  }
  void actor;
  return { id, code, name, created: true };
}

/** Добавить вариант (SKU) в группу с авто-code. */
export function addSkuVariant(
  db: Sql,
  input: { familyId: string; name: string; code?: string; unit?: string },
  actor: string,
): FamilySkuRow {
  const family = db.get<{ id: string; name: string }>(`SELECT id, name FROM product_families WHERE id = ?`, [input.familyId]);
  if (!family) throw new DomainError("Группа не найдена");
  const created = findOrCreateSkuByName(
    db,
    { name: input.name, category: family.name, code: input.code, unit: input.unit },
    actor,
  );
  db.run(`UPDATE skus SET family_id = ?, category = ? WHERE id = ?`, [family.id, family.name, created.id]);
  const row = db.get<FamilySkuRow>(
    `SELECT id, code, name, COALESCE(name_key, '') AS nameKey, category,
            family_id AS familyId, COALESCE(sort_order, 0) AS sortOrder, unit
     FROM skus WHERE id = ?`,
    [created.id],
  );
  if (!row) throw new DomainError("Номенклатура не найдена");
  return row;
}

/** Переместить SKU внутри группы (sort_order ±1 с соседом). */
export function moveSkuInFamily(db: Sql, skuId: string, direction: "up" | "down"): void {
  const sku = db.get<{ id: string; familyId: string | null; sortOrder: number }>(
    `SELECT id, family_id AS familyId, COALESCE(sort_order, 0) AS sortOrder FROM skus WHERE id = ?`,
    [skuId],
  );
  if (!sku) throw new DomainError("Номенклатура не найдена");
  const siblings = db.all<{ id: string; sortOrder: number }>(
    sku.familyId
      ? `SELECT id, COALESCE(sort_order, 0) AS sortOrder FROM skus WHERE family_id = ? ORDER BY sort_order ASC, code ASC`
      : `SELECT id, COALESCE(sort_order, 0) AS sortOrder FROM skus WHERE family_id IS NULL ORDER BY sort_order ASC, code ASC`,
    sku.familyId ? [sku.familyId] : [],
  );
  const index = siblings.findIndex((row) => row.id === skuId);
  if (index < 0) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return;
  const a = siblings[index]!;
  const b = siblings[swapWith]!;
  db.transaction(() => {
    db.run(`UPDATE skus SET sort_order = ? WHERE id = ?`, [b.sortOrder, a.id]);
    db.run(`UPDATE skus SET sort_order = ? WHERE id = ?`, [a.sortOrder, b.id]);
  });
}

export function moveFamily(db: Sql, familyId: string, direction: "up" | "down"): void {
  const families = listProductFamilies(db);
  const index = families.findIndex((row) => row.id === familyId);
  if (index < 0) throw new DomainError("Группа не найдена");
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= families.length) return;
  const a = families[index]!;
  const b = families[swapWith]!;
  db.transaction(() => {
    db.run(`UPDATE product_families SET sort_order = ? WHERE id = ?`, [b.sortOrder, a.id]);
    db.run(`UPDATE product_families SET sort_order = ? WHERE id = ?`, [a.sortOrder, b.id]);
  });
}
