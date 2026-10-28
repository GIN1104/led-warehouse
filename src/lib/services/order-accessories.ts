import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";
import { listKitSubtypesBySkuId } from "@/lib/services/kits";

export type OrderAccessory = {
  id: string;
  orderId: string;
  skuId: string | null;
  skuCode: string | null;
  label: string;
  qty: number;
  assembled: boolean;
  cancelled: boolean;
  sortOrder: number;
};

/** Шаблон аксессуаров из kit subtype (первый unit как эталон) × множитель строки заказа. */
export function kitAccessoryTemplate(
  db: Sql,
  skuId: string,
  lineQty: number,
): { label: string; qty: number }[] {
  const multiplier = Math.max(1, Math.floor(lineQty) || 1);
  const subtype = listKitSubtypesBySkuId(db).get(skuId);
  if (!subtype) return [];
  const unit = subtype.units[0];
  if (!unit || unit.items.length === 0) return [];
  return unit.items.map((item) => ({
    label: item.label,
    qty: item.qty * multiplier,
  }));
}

/** Добавить kit-аксессуары в заказ по строкам (skuId → qty). Идемпотентно не дублирует активные. */
export function attachKitAccessoriesForOrder(
  db: Sql,
  orderId: string,
  lines: { skuId: string; qty: number }[],
): number {
  let added = 0;
  let sort = db.get<{ value: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS value FROM order_accessories WHERE order_id = ?`,
    [orderId],
  )?.value ?? -1;

  for (const line of lines) {
    for (const item of kitAccessoryTemplate(db, line.skuId, line.qty)) {
      const existing = db.get<{ id: string }>(
        `SELECT id FROM order_accessories
         WHERE order_id = ? AND sku_id = ? AND lower(label) = lower(?) AND cancelled = 0`,
        [orderId, line.skuId, item.label],
      );
      if (existing) {
        db.run(`UPDATE order_accessories SET qty = ? WHERE id = ?`, [item.qty, existing.id]);
        continue;
      }
      sort += 1;
      db.run(
        `INSERT INTO order_accessories
          (id, order_id, sku_id, label, qty, assembled, cancelled, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [newId(), orderId, line.skuId, item.label, item.qty, sort, Date.now()],
      );
      added += 1;
    }
  }
  return added;
}

export function listOrderAccessories(db: Sql, orderId: string): OrderAccessory[] {
  return db
    .all<{
      id: string;
      orderId: string;
      skuId: string | null;
      skuCode: string | null;
      label: string;
      qty: number;
      assembled: number;
      cancelled: number;
      sortOrder: number;
    }>(
      `SELECT a.id AS id, a.order_id AS orderId, a.sku_id AS skuId, s.code AS skuCode,
              a.label AS label, a.qty AS qty, a.assembled AS assembled, a.cancelled AS cancelled,
              a.sort_order AS sortOrder
       FROM order_accessories a
       LEFT JOIN skus s ON s.id = a.sku_id
       WHERE a.order_id = ?
       ORDER BY a.cancelled ASC, a.sort_order ASC, a.label ASC`,
      [orderId],
    )
    .map((row) => ({
      id: row.id,
      orderId: row.orderId,
      skuId: row.skuId,
      skuCode: row.skuCode,
      label: row.label,
      qty: Number(row.qty) || 0,
      assembled: Boolean(row.assembled),
      cancelled: Boolean(row.cancelled),
      sortOrder: Number(row.sortOrder) || 0,
    }));
}

export function setOrderAccessoryAssembled(db: Sql, accessoryId: string, assembled: boolean): void {
  const row = db.get<{ id: string; cancelled: number }>(
    `SELECT id, cancelled FROM order_accessories WHERE id = ?`,
    [accessoryId],
  );
  if (!row) throw new DomainError("Строка комплектации заказа не найдена");
  if (row.cancelled) throw new DomainError("Строка комплектации отменена");
  db.run(`UPDATE order_accessories SET assembled = ? WHERE id = ?`, [assembled ? 1 : 0, accessoryId]);
}

/** Снять/отменить позицию аксессуара (не удаляем историю — cancelled=1). */
export function cancelOrderAccessory(db: Sql, accessoryId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM order_accessories WHERE id = ?`, [accessoryId]);
  if (!row) throw new DomainError("Строка комплектации заказа не найдена");
  db.run(`UPDATE order_accessories SET cancelled = 1, assembled = 0 WHERE id = ?`, [accessoryId]);
}

export function restoreOrderAccessory(db: Sql, accessoryId: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM order_accessories WHERE id = ?`, [accessoryId]);
  if (!row) throw new DomainError("Строка комплектации заказа не найдена");
  db.run(`UPDATE order_accessories SET cancelled = 0 WHERE id = ?`, [accessoryId]);
}
