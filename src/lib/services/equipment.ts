import {
  canTransitionEquipment,
  isEquipmentStatus,
  type EquipmentStatus,
} from "@/lib/domain/equipment-status";
import { canonicalizeEquipmentName } from "@/lib/domain/he-ru-glossary";
import { DomainError } from "@/lib/domain/errors";
import { normalizeEquipmentName } from "@/lib/domain/sku-code";
import { newId, type Sql } from "@/lib/db/sql";
import { findOrCreateSkuByName } from "@/lib/services/catalog-hierarchy";
import type { MapperOrderDraft } from "@/lib/services/mapper-sheet";

export type EquipmentItemRow = {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  qty: number;
  status: EquipmentStatus;
  locationId: string | null;
  locationName: string | null;
  note: string;
  source: string;
  externalRef: string | null;
  orderId: string | null;
  customerName: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
};

export type EquipmentHistoryRow = {
  id: string;
  itemId: string;
  fromStatus: EquipmentStatus | null;
  toStatus: EquipmentStatus;
  note: string;
  actor: string;
  createdAt: number;
};

export type AddEquipmentInput = {
  skuId: string;
  qty: number;
  status?: EquipmentStatus;
  locationId?: string;
  note?: string;
  customerName?: string;
  source?: string;
  externalRef?: string;
  orderId?: string;
};

function resolveSku(db: Sql, skuIdOrCode: string): { id: string; code: string } {
  const code = skuIdOrCode.trim().toUpperCase();
  const sku = db.get<{ id: string; code: string }>(
    `SELECT id, code FROM skus WHERE id = ? OR upper(code) = ? OR upper(id) = ?`,
    [skuIdOrCode, code, code],
  );
  if (!sku) throw new DomainError("Номенклатура не найдена");
  return sku;
}

function writeHistory(
  db: Sql,
  itemId: string,
  fromStatus: EquipmentStatus | null,
  toStatus: EquipmentStatus,
  actor: string,
  note: string,
  at: number,
): void {
  db.run(
    `INSERT INTO equipment_status_history (id, item_id, from_status, to_status, note, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId(), itemId, fromStatus, toStatus, note, actor, at],
  );
}

/** Добавить qty-строку оборудования (вручную или из импорта). */
export function addEquipmentItem(db: Sql, input: AddEquipmentInput, actor: string): EquipmentItemRow {
  const sku = resolveSku(db, input.skuId);
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    throw new DomainError("Количество должно быть целым и больше нуля");
  }
  const status: EquipmentStatus = input.status ?? "available";
  if (!isEquipmentStatus(status)) throw new DomainError("Неизвестный статус оборудования");
  if (input.locationId) {
    const location = db.get<{ id: string }>(`SELECT id FROM locations WHERE id = ?`, [input.locationId]);
    if (!location) throw new DomainError("Локация не найдена");
  }
  const now = Date.now();
  const id = newId();
  db.transaction(() => {
    db.run(
      `INSERT INTO equipment_items
        (id, sku_id, qty, status, location_id, note, source, external_ref, order_id, customer_name, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sku.id,
        input.qty,
        status,
        input.locationId ?? null,
        (input.note ?? "").trim(),
        input.source ?? "manual",
        input.externalRef?.trim() || null,
        input.orderId ?? null,
        (input.customerName ?? "").trim(),
        now,
        now,
        actor,
      ],
    );
    writeHistory(db, id, null, status, actor, input.note?.trim() || "создано", now);
  });
  const row = getEquipmentItem(db, id);
  if (!row) throw new DomainError("Не удалось создать позицию оборудования");
  return row;
}

/** Резолв строки mapper: по code или по name с автосозданием SKU/code. */
export function resolveMapperLineSku(
  db: Sql,
  line: { code?: string; name?: string; category?: string },
  actor: string,
): { id: string; code: string; created: boolean } {
  const code = line.code?.trim().toUpperCase() ?? "";
  const name = line.name?.trim() ?? "";
  if (name) {
    const sku = findOrCreateSkuByName(
      db,
      { name, code: code || undefined, category: line.category },
      actor,
    );
    return { id: sku.id, code: sku.code, created: sku.created };
  }
  if (!code) throw new DomainError("В строке нужны code или name/название");
  const sku = db.get<{ id: string; code: string }>(
    `SELECT id, code FROM skus WHERE upper(code) = ? OR upper(id) = ?`,
    [code, code],
  );
  if (!sku) throw new DomainError(`Неизвестная номенклатура: ${code}`);
  return { id: sku.id, code: sku.code, created: false };
}

/**
 * Импорт Excel/CSV mapper → позиции со статусом reserved.
 * Строки с названием без code создают SKU со стабильным авто-code.
 * Повтор того же external_ref + sku обновляет qty, не дублирует строку.
 */
export function importEquipmentReserved(
  db: Sql,
  draft: MapperOrderDraft,
  actor: string,
  options?: { orderId?: string },
): { created: number; updated: number; skusCreated: number; items: EquipmentItemRow[] } {
  if (draft.lines.length === 0) throw new DomainError("Добавьте хотя бы одну строку");
  const externalRef = (draft.externalId?.trim() || `mapper:${draft.customerName}|${draft.startDate}|${draft.endDate}`).slice(0, 200);
  let created = 0;
  let updated = 0;
  let skusCreated = 0;
  const itemIds: string[] = [];

  db.transaction(() => {
    for (const line of draft.lines) {
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new DomainError("Количество в строке должно быть целым и больше нуля");
      }
      const sku = resolveMapperLineSku(db, line, actor);
      if (sku.created) skusCreated += 1;
      const existing = db.get<{ id: string; status: string }>(
        `SELECT id, status FROM equipment_items WHERE external_ref = ? AND sku_id = ? AND status = 'reserved'`,
        [externalRef, sku.id],
      );
      const now = Date.now();
      const note = [
        line.note?.trim(),
        draft.notes?.trim(),
        draft.customerName.trim() ? `заказчик: ${draft.customerName.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (existing) {
        db.run(
          `UPDATE equipment_items
           SET qty = ?, customer_name = ?, note = ?, order_id = COALESCE(?, order_id), updated_at = ?, created_by = ?
           WHERE id = ?`,
          [line.qty, draft.customerName.trim(), note, options?.orderId ?? null, now, actor, existing.id],
        );
        writeHistory(db, existing.id, "reserved", "reserved", actor, `импорт: qty → ${line.qty}`, now);
        updated += 1;
        itemIds.push(existing.id);
      } else {
        const id = newId();
        db.run(
          `INSERT INTO equipment_items
            (id, sku_id, qty, status, location_id, note, source, external_ref, order_id, customer_name, created_at, updated_at, created_by)
           VALUES (?, ?, ?, 'reserved', NULL, ?, 'mapper', ?, ?, ?, ?, ?, ?)`,
          [id, sku.id, line.qty, note, externalRef, options?.orderId ?? null, draft.customerName.trim(), now, now, actor],
        );
        writeHistory(db, id, null, "reserved", actor, "импорт mapper → reserved", now);
        created += 1;
        itemIds.push(id);
      }
    }
  });

  return {
    created,
    updated,
    skusCreated,
    items: itemIds.map((id) => getEquipmentItem(db, id)!).filter(Boolean),
  };
}

/** Сменить статус позиции (вручную, без сканера). */
export function setEquipmentStatus(
  db: Sql,
  itemId: string,
  toStatus: EquipmentStatus,
  actor: string,
  note = "",
): EquipmentItemRow {
  if (!isEquipmentStatus(toStatus)) throw new DomainError("Неизвестный статус оборудования");
  const current = db.get<{ id: string; status: EquipmentStatus }>(
    `SELECT id, status FROM equipment_items WHERE id = ?`,
    [itemId],
  );
  if (!current) throw new DomainError("Позиция оборудования не найдена");
  if (!canTransitionEquipment(current.status, toStatus)) {
    throw new DomainError(`Нельзя сменить статус с «${current.status}» на «${toStatus}»`);
  }
  const now = Date.now();
  db.transaction(() => {
    db.run(`UPDATE equipment_items SET status = ?, updated_at = ? WHERE id = ?`, [toStatus, now, itemId]);
    writeHistory(db, itemId, current.status, toStatus, actor, note.trim() || `→ ${toStatus}`, now);
  });
  const row = getEquipmentItem(db, itemId);
  if (!row) throw new DomainError("Позиция оборудования не найдена");
  return row;
}

export type UpdateEquipmentInput = {
  qty?: number;
  skuName?: string;
  note?: string;
  customerName?: string;
  locationId?: string | null;
  status?: EquipmentStatus;
};

/** Обновить qty / имя SKU / заметку / статус позиции. */
export function updateEquipmentItem(
  db: Sql,
  itemId: string,
  input: UpdateEquipmentInput,
  actor: string,
): EquipmentItemRow {
  const current = db.get<{ id: string; skuId: string; qty: number; status: EquipmentStatus; note: string; customerName: string; locationId: string | null }>(
    `SELECT id, sku_id AS skuId, qty, status, note, customer_name AS customerName, location_id AS locationId
     FROM equipment_items WHERE id = ?`,
    [itemId],
  );
  if (!current) throw new DomainError("Позиция оборудования не найдена");

  const nextQty = input.qty !== undefined ? input.qty : current.qty;
  if (!Number.isInteger(nextQty) || nextQty <= 0) {
    throw new DomainError("Количество должно быть целым и больше нуля");
  }

  let nextStatus = current.status;
  if (input.status !== undefined) {
    if (!isEquipmentStatus(input.status)) throw new DomainError("Неизвестный статус оборудования");
    if (input.status !== current.status && !canTransitionEquipment(current.status, input.status)) {
      throw new DomainError(`Нельзя сменить статус с «${current.status}» на «${input.status}»`);
    }
    nextStatus = input.status;
  }

  const nextNote = input.note !== undefined ? input.note.trim() : current.note;
  const nextCustomer = input.customerName !== undefined ? input.customerName.trim() : current.customerName;
  const nextLocation =
    input.locationId !== undefined ? (input.locationId?.trim() || null) : current.locationId;
  if (nextLocation) {
    const location = db.get<{ id: string }>(`SELECT id FROM locations WHERE id = ?`, [nextLocation]);
    if (!location) throw new DomainError("Локация не найдена");
  }

  const nameTrimmed = input.skuName?.trim();
  const now = Date.now();
  const notes: string[] = [];

  db.transaction(() => {
    if (nameTrimmed !== undefined) {
      if (nameTrimmed.length < 1) throw new DomainError("Укажите название");
      const display = canonicalizeEquipmentName(nameTrimmed);
      const nameKey = normalizeEquipmentName(display);
      if (!nameKey) throw new DomainError("Укажите название");
      const clash = db.get<{ id: string }>(
        `SELECT id FROM skus WHERE name_key = ? AND id != ?`,
        [nameKey, current.skuId],
      );
      if (clash) throw new DomainError("Номенклатура с таким названием уже есть");
      const before = db.get<{ name: string }>(`SELECT name FROM skus WHERE id = ?`, [current.skuId]);
      db.run(`UPDATE skus SET name = ?, name_key = ? WHERE id = ?`, [display, nameKey, current.skuId]);
      if (before && before.name !== display) notes.push(`имя → ${display}`);
    }

    if (nextQty !== current.qty) notes.push(`qty → ${nextQty}`);
    if (nextStatus !== current.status) notes.push(`→ ${nextStatus}`);
    if (nextNote !== current.note) notes.push("заметка");
    if (nextCustomer !== current.customerName) notes.push("заказчик");
    if (nextLocation !== current.locationId) notes.push("локация");

    db.run(
      `UPDATE equipment_items
       SET qty = ?, status = ?, note = ?, customer_name = ?, location_id = ?, updated_at = ?, created_by = ?
       WHERE id = ?`,
      [nextQty, nextStatus, nextNote, nextCustomer, nextLocation, now, actor, itemId],
    );

    if (notes.length > 0) {
      writeHistory(
        db,
        itemId,
        current.status,
        nextStatus,
        actor,
        notes.join(" · ") || "обновление",
        now,
      );
    }
  });

  const row = getEquipmentItem(db, itemId);
  if (!row) throw new DomainError("Позиция оборудования не найдена");
  return row;
}

/** Удалить qty-строку и её историю статусов. */
export function deleteEquipmentItem(db: Sql, itemId: string, actor: string): void {
  void actor;
  const current = db.get<{ id: string }>(`SELECT id FROM equipment_items WHERE id = ?`, [itemId]);
  if (!current) throw new DomainError("Позиция оборудования не найдена");
  db.transaction(() => {
    db.run(`DELETE FROM equipment_status_history WHERE item_id = ?`, [itemId]);
    db.run(`DELETE FROM equipment_items WHERE id = ?`, [itemId]);
  });
}

export function getEquipmentItem(db: Sql, id: string): EquipmentItemRow | undefined {
  return listEquipmentItems(db, { id })[0];
}

export type EquipmentListFilter = {
  id?: string;
  status?: EquipmentStatus | "all";
  query?: string;
};

export function listEquipmentItems(db: Sql, filter: EquipmentListFilter = {}): EquipmentItemRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.id) {
    clauses.push("e.id = ?");
    params.push(filter.id);
  }
  if (filter.status && filter.status !== "all") {
    clauses.push("e.status = ?");
    params.push(filter.status);
  }
  if (filter.query?.trim()) {
    const q = `%${filter.query.trim().toLowerCase()}%`;
    clauses.push(`(lower(s.code) LIKE ? OR lower(s.name) LIKE ? OR lower(e.customer_name) LIKE ? OR lower(e.note) LIKE ?)`);
    params.push(q, q, q, q);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.all<EquipmentItemRow>(
    `SELECT e.id AS id, e.sku_id AS skuId, s.code AS skuCode, s.name AS skuName, s.unit AS unit,
            e.qty AS qty, e.status AS status, e.location_id AS locationId, l.name AS locationName,
            e.note AS note, e.source AS source, e.external_ref AS externalRef, e.order_id AS orderId,
            e.customer_name AS customerName, e.created_at AS createdAt, e.updated_at AS updatedAt,
            e.created_by AS createdBy
     FROM equipment_items e
     INNER JOIN skus s ON s.id = e.sku_id
     LEFT JOIN locations l ON l.id = e.location_id
     ${where}
     ORDER BY e.updated_at DESC`,
    params,
  );
}

export function listEquipmentHistory(db: Sql, itemId: string, limit = 20): EquipmentHistoryRow[] {
  return db.all<EquipmentHistoryRow>(
    `SELECT id, item_id AS itemId, from_status AS fromStatus, to_status AS toStatus,
            note, actor, created_at AS createdAt
     FROM equipment_status_history
     WHERE item_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [itemId, limit],
  );
}

export type EquipmentSortKey = "code" | "name" | "qty" | "status" | "customer" | "updated";

export function sortEquipmentItems(
  rows: EquipmentItemRow[],
  key: EquipmentSortKey,
  dir: "asc" | "desc" = "asc",
): EquipmentItemRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "code":
        cmp = a.skuCode.localeCompare(b.skuCode, "ru");
        break;
      case "name":
        cmp = a.skuName.localeCompare(b.skuName, "ru");
        break;
      case "qty":
        cmp = a.qty - b.qty;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "customer":
        cmp = a.customerName.localeCompare(b.customerName, "ru");
        break;
      case "updated":
        cmp = a.updatedAt - b.updatedAt;
        break;
      default:
        cmp = 0;
    }
    return cmp * sign;
  });
}
