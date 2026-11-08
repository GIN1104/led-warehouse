import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";
import { applyMovement } from "@/lib/services/ledger";
import { notifyTransferTelegram } from "@/lib/telegram/notify";

export type TransferStatus = "planned" | "in_transit" | "received" | "cancelled";

export type StockTransferRow = {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  unit: string;
  qty: number;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  status: TransferStatus;
  orderId: string | null;
  driverUserId: string | null;
  driverName: string | null;
  note: string;
  createdAt: number;
  createdBy: string;
  shippedAt: number | null;
  receivedAt: number | null;
};

const LIST_SQL = `
SELECT t.id AS id, t.sku_id AS skuId, s.code AS skuCode, s.name AS skuName, s.unit AS unit, t.qty AS qty,
       t.from_location_id AS fromLocationId, f.name AS fromLocationName,
       t.to_location_id AS toLocationId, d.name AS toLocationName,
       t.status AS status, t.order_id AS orderId, t.driver_user_id AS driverUserId,
       u.name AS driverName, t.note AS note, t.created_at AS createdAt, t.created_by AS createdBy,
       t.shipped_at AS shippedAt, t.received_at AS receivedAt
FROM stock_transfers t
INNER JOIN skus s ON s.id = t.sku_id
INNER JOIN locations f ON f.id = t.from_location_id
INNER JOIN locations d ON d.id = t.to_location_id
LEFT JOIN users u ON u.id = t.driver_user_id
`;

export function listTransfers(db: Sql): StockTransferRow[] {
  return db.all<StockTransferRow>(`${LIST_SQL} ORDER BY t.created_at DESC`);
}

function readTransfer(db: Sql, id: string): StockTransferRow {
  const row = db.get<StockTransferRow>(`${LIST_SQL} WHERE t.id = ?`, [id]);
  if (!row) throw new DomainError("Перемещение не найдено");
  return row;
}

export function planTransfer(
  db: Sql,
  input: {
    skuId: string;
    qty: number;
    fromLocationId: string;
    toLocationId: string;
    orderId?: string | null;
    driverUserId?: string | null;
    note?: string;
  },
  actor: string,
): StockTransferRow {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new DomainError("Количество перемещения должно быть целым и больше нуля");
  }
  if (input.fromLocationId === input.toLocationId) {
    throw new DomainError("Локации перемещения должны различаться");
  }
  const sku = db.get(`SELECT id FROM skus WHERE id = ?`, [input.skuId]);
  if (!sku) throw new DomainError("Номенклатура не найдена");
  const from = db.get(`SELECT id FROM locations WHERE id = ?`, [input.fromLocationId]);
  const to = db.get(`SELECT id FROM locations WHERE id = ?`, [input.toLocationId]);
  if (!from || !to) throw new DomainError("Локация не найдена");
  if (input.driverUserId) {
    const driver = db.get<{ role: string }>(`SELECT role FROM users WHERE id = ?`, [input.driverUserId]);
    if (!driver) throw new DomainError("Водитель не найден");
  }
  if (input.orderId) {
    const order = db.get(`SELECT id FROM rental_orders WHERE id = ?`, [input.orderId]);
    if (!order) throw new DomainError("Заказ не найден");
  }
  const onHand =
    db.get<{ qty: number }>(
      `SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = ? AND location_id = ?`,
      [input.skuId, input.fromLocationId],
    )?.qty ?? 0;
  if (onHand < input.qty) {
    throw new DomainError(`Недостаточно остатка на локации (стало бы ${onHand - input.qty})`);
  }

  const id = `tr_${newId().replace(/-/g, "").slice(0, 12)}`;
  const now = Date.now();
  db.run(
    `INSERT INTO stock_transfers
      (id, sku_id, qty, from_location_id, to_location_id, status, order_id, driver_user_id, note, created_at, created_by, shipped_at, received_at)
     VALUES (?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      id,
      input.skuId,
      input.qty,
      input.fromLocationId,
      input.toLocationId,
      input.orderId ?? null,
      input.driverUserId ?? null,
      (input.note ?? "").trim().slice(0, 500),
      now,
      actor,
    ],
  );
  return readTransfer(db, id);
}

/** Списание с from — статус in_transit (в дороге). */
export function shipTransfer(db: Sql, id: string, actor: string): StockTransferRow {
  const row = readTransfer(db, id);
  if (row.status !== "planned") throw new DomainError("Отправить можно только запланированное перемещение");
  applyMovement(
    db,
    {
      skuId: row.skuId,
      type: "out",
      qty: row.qty,
      locationId: row.fromLocationId,
      reason: `Перемещение ${row.id} → в дороге`,
      orderId: row.orderId ?? undefined,
    },
    actor,
  );
  db.run(`UPDATE stock_transfers SET status = 'in_transit', shipped_at = ? WHERE id = ?`, [Date.now(), id]);
  const shipped = readTransfer(db, id);
  notifyTransferTelegram(db, {
    action: "shipped",
    skuCode: shipped.skuCode,
    qty: shipped.qty,
    fromName: shipped.fromLocationName,
    toName: shipped.toLocationName,
    transferId: shipped.id,
  });
  return shipped;
}

/** Приход на to — received. */
export function receiveTransfer(db: Sql, id: string, actor: string): StockTransferRow {
  const row = readTransfer(db, id);
  if (row.status !== "in_transit") throw new DomainError("Принять можно только перемещение в дороге");
  applyMovement(
    db,
    {
      skuId: row.skuId,
      type: "in",
      qty: row.qty,
      locationId: row.toLocationId,
      reason: `Перемещение ${row.id} принято`,
      orderId: row.orderId ?? undefined,
    },
    actor,
  );
  db.run(`UPDATE stock_transfers SET status = 'received', received_at = ? WHERE id = ?`, [Date.now(), id]);
  const received = readTransfer(db, id);
  notifyTransferTelegram(db, {
    action: "received",
    skuCode: received.skuCode,
    qty: received.qty,
    fromName: received.fromLocationName,
    toName: received.toLocationName,
    transferId: received.id,
  });
  return received;
}

export function cancelTransfer(db: Sql, id: string, actor: string): StockTransferRow {
  const row = readTransfer(db, id);
  if (row.status === "received" || row.status === "cancelled") {
    throw new DomainError("Это перемещение уже нельзя отменить");
  }
  if (row.status === "in_transit") {
    applyMovement(
      db,
      {
        skuId: row.skuId,
        type: "in",
        qty: row.qty,
        locationId: row.fromLocationId,
        reason: `Перемещение ${row.id} отменено — возврат`,
        orderId: row.orderId ?? undefined,
      },
      actor,
    );
  }
  db.run(`UPDATE stock_transfers SET status = 'cancelled' WHERE id = ?`, [id]);
  const cancelled = readTransfer(db, id);
  notifyTransferTelegram(db, {
    action: "cancelled",
    skuCode: cancelled.skuCode,
    qty: cancelled.qty,
    fromName: cancelled.fromLocationName,
    toName: cancelled.toLocationName,
    transferId: cancelled.id,
  });
  return cancelled;
}
