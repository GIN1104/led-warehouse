import { assertDateRange, todayIso } from "@/lib/dates";
import { allocateForSku } from "@/lib/domain/allocation";
import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";

type SkuRecord = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  trackMode: string;
  description: string;
};

type OrderRecord = {
  id: string;
  customerName: string;
  startDate: string;
  endDate: string;
  status: "confirmed" | "cancelled" | "closed";
  notes: string;
  createdAt: number;
  createdBy: string;
};

type LineRecord = {
  id: string;
  orderId: string;
  skuId: string;
  qtyRequested: number;
  qtySoftReserved: number;
  qtyShortage: number;
};

type SignalRecord = {
  id: string;
  skuId: string;
  orderId: string;
  startDate: string;
  endDate: string;
  qtyShort: number;
  status: "open" | "closed";
};

type HireRecord = {
  id: string;
  skuId: string;
  qty: number;
  orderId: string;
  alertId: string | null;
  status: "needed" | "ordered" | "received" | "closed";
  supplierNote: string;
  createdAt: number;
};

type AlertRecord = {
  id: string;
  type: string;
  status: "open" | "ack" | "closed";
  skuId: string | null;
  orderId: string | null;
  externalHireId: string | null;
  message: string;
  createdAt: number;
};

const SKU_SQL = `SELECT id, code, name, category, unit, track_mode AS trackMode, description FROM skus`;
const ORDER_SQL = `SELECT id, customer_name AS customerName, start_date AS startDate, end_date AS endDate, status, notes, created_at AS createdAt, created_by AS createdBy FROM rental_orders`;
const LINE_SQL = `SELECT id, order_id AS orderId, sku_id AS skuId, qty_requested AS qtyRequested, qty_soft_reserved AS qtySoftReserved, qty_shortage AS qtyShortage FROM rental_lines`;
const SIGNAL_SQL = `SELECT id, sku_id AS skuId, order_id AS orderId, start_date AS startDate, end_date AS endDate, qty_short AS qtyShort, status FROM shortage_signals`;
const HIRE_SQL = `SELECT id, sku_id AS skuId, qty, order_id AS orderId, alert_id AS alertId, status, supplier_note AS supplierNote, created_at AS createdAt FROM external_hires`;
const ALERT_SQL = `SELECT id, type, status, sku_id AS skuId, order_id AS orderId, external_hire_id AS externalHireId, message, created_at AS createdAt FROM alerts`;

export type MovementType = "in" | "out" | "adjust" | "move";

export type MovementInput = {
  skuId: string;
  type: MovementType;
  qty: number;
  locationId: string;
  fromLocationId?: string;
  reason?: string;
  orderId?: string;
  scanEventId?: string;
};

export type CreateOrderInput = {
  customerName: string;
  startDate: string;
  endDate: string;
  notes?: string;
  lines: { skuId: string; qty: number }[];
  createdAt?: number;
  source?: "ui" | "mapper";
  externalId?: string;
};

export type ScanResult = {
  event_id: string;
  status: "accepted" | "rejected";
  reason?: string;
  movement_id?: string;
  alert_ids?: string[];
  issued?: { order_id: string; qty: number }[];
  idempotent?: boolean;
};

export type IncomingScan = {
  eventId: string;
  source: string;
  code: string;
  direction: "in" | "out" | "move";
  qty: number;
  deviceId?: string;
  locationId?: string;
  fromLocationId?: string;
  meta?: Record<string, unknown>;
  at?: string;
};

function inTx<T>(db: Sql, fn: (tx: Sql) => T): T {
  return db.transaction(() => fn(db));
}

function audit(tx: Sql, actor: string, action: string, entity: string, entityId: string, payload: unknown): void {
  tx.run(
    `INSERT INTO audit_log (id, actor, action, entity, entity_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId(), actor, action, entity, entityId, JSON.stringify(payload), Date.now()],
  );
}

function isUniqueError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

export function createSku(
  db: Sql,
  input: { code: string; name: string; category: string; unit?: string; description?: string },
  actor: string,
): string {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const category = input.category.trim();
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) {
    throw new DomainError("Код: латиница, цифры и дефис, от 2 до 32 символов");
  }
  if (name.length < 2) throw new DomainError("Укажите название");
  if (category.length < 2) throw new DomainError("Укажите категорию");
  const id = newId();
  try {
    inTx(db, (tx) => {
      tx.run(
        `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES (?, ?, ?, ?, ?, 'quantity', ?)`,
        [id, code, name, category, input.unit?.trim() || "шт", input.description?.trim() ?? ""],
      );
      audit(tx, actor, "sku.create", "sku", id, { code, name });
    });
  } catch (error) {
    if (isUniqueError(error)) throw new DomainError("Такой код номенклатуры уже есть");
    throw error;
  }
  return id;
}

export function createLocation(
  db: Sql,
  input: { name: string; kind: "warehouse" | "zone" | "bin"; parentId?: string },
  actor: string,
): string {
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Укажите название локации");
  if (input.parentId) {
    const parent = db.get(`SELECT id FROM locations WHERE id = ?`, [input.parentId]);
    if (!parent) throw new DomainError("Родительская локация не найдена");
  }
  const id = newId();
  inTx(db, (tx) => {
    tx.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES (?, ?, ?, ?)`, [
      id,
      name,
      input.kind,
      input.parentId || null,
    ]);
    audit(tx, actor, "location.create", "location", id, { name, kind: input.kind });
  });
  return id;
}

function balanceOf(tx: Sql, skuId: string, locationId: string): number {
  return tx.get<{ qty: number }>(
    `SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = ? AND location_id = ?`,
    [skuId, locationId],
  )?.qty ?? 0;
}

function setBalance(tx: Sql, skuId: string, locationId: string, qtyOnHand: number): void {
  const existing = tx.get(`SELECT 1 AS ok FROM stock_balances WHERE sku_id = ? AND location_id = ?`, [skuId, locationId]);
  if (!existing) {
    tx.run(`INSERT INTO stock_balances (sku_id, location_id, qty_on_hand, qty_reserved) VALUES (?, ?, ?, 0)`, [
      skuId,
      locationId,
      qtyOnHand,
    ]);
    return;
  }
  tx.run(`UPDATE stock_balances SET qty_on_hand = ? WHERE sku_id = ? AND location_id = ?`, [qtyOnHand, skuId, locationId]);
}

/**
 * Пересчёт мягких резервов SKU.
 * Закрытая вручную внешняя аренда не открывается заново, пока нехватка не падала до нуля.
 * Пока заявка в статусе needed, количество следует за текущей нехваткой.
 */
export function recalcSku(tx: Sql, skuId: string): void {
  const sku = tx.get<SkuRecord>(`${SKU_SQL} WHERE id = ?`, [skuId]);
  if (!sku) return;

  const onHand = Number(
    tx.get<{ total: number | null }>(`SELECT SUM(qty_on_hand) AS total FROM stock_balances WHERE sku_id = ?`, [skuId])?.total ?? 0,
  );

  const rows = tx.all<{
    id: string;
    qtyRequested: number;
    qtyIssued: number;
    qtySoftReserved: number;
    qtyShortage: number;
    startDate: string;
    endDate: string;
    createdAt: number;
    customerName: string;
    orderId: string;
    status: OrderRecord["status"];
    notes: string;
    createdBy: string;
  }>(
    `SELECT l.id AS id, l.qty_requested AS qtyRequested, l.qty_issued AS qtyIssued, l.qty_soft_reserved AS qtySoftReserved, l.qty_shortage AS qtyShortage,
            o.start_date AS startDate, o.end_date AS endDate, o.created_at AS createdAt, o.customer_name AS customerName,
            o.id AS orderId, o.status AS status, o.notes AS notes, o.created_by AS createdBy
     FROM rental_lines l
     INNER JOIN rental_orders o ON o.id = l.order_id
     WHERE l.sku_id = ? AND o.status = 'confirmed'`,
    [skuId],
  );

  const allocations = allocateForSku(
    onHand,
    rows.map((row) => ({
      id: row.id,
      qtyRequested: Math.max(0, row.qtyRequested - row.qtyIssued),
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: row.createdAt,
    })),
  );
  const byId = new Map(allocations.map((item) => [item.id, item]));

  for (const row of rows) {
    const allocation = byId.get(row.id);
    if (!allocation) continue;
    if (row.qtySoftReserved !== allocation.qtySoftReserved || row.qtyShortage !== allocation.qtyShortage) {
      tx.run(`UPDATE rental_lines SET qty_soft_reserved = ?, qty_shortage = ? WHERE id = ?`, [
        allocation.qtySoftReserved,
        allocation.qtyShortage,
        row.id,
      ]);
    }
    syncShortage(tx, sku, {
      id: row.orderId,
      customerName: row.customerName,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }, allocation.qtyShortage);
  }

  syncReservedSnapshot(tx, skuId);
}

function syncShortage(tx: Sql, sku: SkuRecord, order: OrderRecord, qtyShortage: number): void {
  const signal = tx.get<SignalRecord>(`${SIGNAL_SQL} WHERE order_id = ? AND sku_id = ?`, [order.id, sku.id]);
  const hire = tx.get<HireRecord>(`${HIRE_SQL} WHERE order_id = ? AND sku_id = ?`, [order.id, sku.id]);
  const prevShort = signal?.status === "open" ? signal.qtyShort : 0;
  const now = Date.now();

  if (qtyShortage > 0) {
    if (!signal) {
      tx.run(
        `INSERT INTO shortage_signals (id, sku_id, order_id, start_date, end_date, qty_short, status) VALUES (?, ?, ?, ?, ?, ?, 'open')`,
        [newId(), sku.id, order.id, order.startDate, order.endDate, qtyShortage],
      );
    } else {
      tx.run(
        `UPDATE shortage_signals SET qty_short = ?, status = 'open', start_date = ?, end_date = ? WHERE id = ?`,
        [qtyShortage, order.startDate, order.endDate, signal.id],
      );
    }

    let hireId = hire?.id ?? null;
    if (!hire) {
      hireId = newId();
      tx.run(
        `INSERT INTO external_hires (id, sku_id, qty, order_id, alert_id, status, supplier_note, created_at) VALUES (?, ?, ?, ?, NULL, 'needed', '', ?)`,
        [hireId, sku.id, qtyShortage, order.id, now],
      );
    } else if (hire.status === "needed") {
      tx.run(`UPDATE external_hires SET qty = ? WHERE id = ?`, [qtyShortage, hire.id]);
    } else if (hire.status === "closed" && prevShort === 0) {
      tx.run(`UPDATE external_hires SET qty = ?, status = 'needed' WHERE id = ?`, [qtyShortage, hire.id]);
    }

    const message = `Нехватка ${sku.code}: ${qtyShortage} ${sku.unit} по заказу «${order.customerName}». Можно арендовать снаружи.`;
    const existingAlerts = tx.all<AlertRecord>(`${ALERT_SQL} WHERE order_id = ? AND sku_id = ? AND type = 'shortage'`, [
      order.id,
      sku.id,
    ]);

    if (existingAlerts.length === 0) {
      const alertId = newId();
      tx.run(
        `INSERT INTO alerts (id, type, status, sku_id, order_id, external_hire_id, message, created_at) VALUES (?, 'shortage', 'open', ?, ?, ?, ?, ?)`,
        [alertId, sku.id, order.id, hireId, message, now],
      );
      if (hireId) tx.run(`UPDATE external_hires SET alert_id = ? WHERE id = ?`, [alertId, hireId]);
    } else {
      const [first, ...rest] = existingAlerts;
      if (!first) return;
      tx.run(`UPDATE alerts SET status = ?, message = ?, external_hire_id = ? WHERE id = ?`, [
        first.status === "ack" ? "ack" : "open",
        message,
        hireId,
        first.id,
      ]);
      for (const extra of rest) tx.run(`UPDATE alerts SET status = 'closed' WHERE id = ?`, [extra.id]);
      if (hireId) tx.run(`UPDATE external_hires SET alert_id = ? WHERE id = ?`, [first.id, hireId]);
    }
    return;
  }

  if (signal && signal.status !== "closed") {
    tx.run(`UPDATE shortage_signals SET qty_short = 0, status = 'closed' WHERE id = ?`, [signal.id]);
  }
  if (hire?.status === "needed") {
    tx.run(`UPDATE external_hires SET status = 'closed', qty = 0 WHERE id = ?`, [hire.id]);
  }
  const openAlerts = tx.all<AlertRecord>(`${ALERT_SQL} WHERE order_id = ? AND sku_id = ? AND type = 'shortage'`, [
    order.id,
    sku.id,
  ]);
  for (const alert of openAlerts) {
    if (alert.status !== "closed") tx.run(`UPDATE alerts SET status = 'closed' WHERE id = ?`, [alert.id]);
  }
}

/** Снимок резерва на сегодня: целиком на локации с наибольшим остатком. Истина по строкам заказа. */
function syncReservedSnapshot(tx: Sql, skuId: string): void {
  const today = todayIso();
  const lines = tx.all<{ qtySoftReserved: number; startDate: string; endDate: string }>(
    `SELECT l.qty_soft_reserved AS qtySoftReserved, o.start_date AS startDate, o.end_date AS endDate
     FROM rental_lines l INNER JOIN rental_orders o ON o.id = l.order_id
     WHERE l.sku_id = ? AND o.status = 'confirmed'`,
    [skuId],
  );
  const reservedToday = lines
    .filter((row) => row.startDate <= today && today <= row.endDate)
    .reduce((sumQty, row) => sumQty + row.qtySoftReserved, 0);

  const balances = tx
    .all<{ locationId: string; qtyOnHand: number }>(
      `SELECT location_id AS locationId, qty_on_hand AS qtyOnHand FROM stock_balances WHERE sku_id = ?`,
      [skuId],
    )
    .sort((a, b) => b.qtyOnHand - a.qtyOnHand);

  balances.forEach((row, index) => {
    tx.run(`UPDATE stock_balances SET qty_reserved = ? WHERE sku_id = ? AND location_id = ?`, [
      index === 0 ? reservedToday : 0,
      skuId,
      row.locationId,
    ]);
  });
}

function applyMovementTx(tx: Sql, input: MovementInput, actor: string): string {
  const sku = tx.get(`${SKU_SQL} WHERE id = ?`, [input.skuId]);
  if (!sku) throw new DomainError("Номенклатура не найдена");
  const location = tx.get(`SELECT id FROM locations WHERE id = ?`, [input.locationId]);
  if (!location) throw new DomainError("Локация не найдена");
  if (!Number.isInteger(input.qty)) throw new DomainError("Количество должно быть целым");

  const effects: { locationId: string; delta: number }[] = [];
  if (input.type === "in" || input.type === "out") {
    if (input.qty <= 0) throw new DomainError("Количество должно быть больше нуля");
    effects.push({ locationId: input.locationId, delta: input.type === "in" ? input.qty : -input.qty });
  } else if (input.type === "adjust") {
    if (input.qty === 0) throw new DomainError("Корректировка не может быть нулевой");
    effects.push({ locationId: input.locationId, delta: input.qty });
  } else {
    if (input.qty <= 0) throw new DomainError("Количество должно быть больше нуля");
    if (!input.fromLocationId) throw new DomainError("Для перемещения нужна исходная локация");
    if (input.fromLocationId === input.locationId) throw new DomainError("Локации перемещения должны различаться");
    const source = tx.get(`SELECT id FROM locations WHERE id = ?`, [input.fromLocationId]);
    if (!source) throw new DomainError("Исходная локация не найдена");
    effects.push({ locationId: input.fromLocationId, delta: -input.qty });
    effects.push({ locationId: input.locationId, delta: input.qty });
  }

  const merged = new Map<string, number>();
  for (const effect of effects) {
    merged.set(effect.locationId, (merged.get(effect.locationId) ?? 0) + effect.delta);
  }
  const nextQty = new Map<string, number>();
  for (const [locationId, delta] of merged) {
    const next = balanceOf(tx, input.skuId, locationId) + delta;
    if (next < 0) throw new DomainError(`Недостаточно остатка на локации (стало бы ${next})`);
    nextQty.set(locationId, next);
  }

  const movementId = newId();
  tx.run(
    `INSERT INTO stock_movements (id, sku_id, location_id, from_location_id, type, qty, reason, order_id, scan_event_id, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movementId,
      input.skuId,
      input.locationId,
      input.fromLocationId ?? null,
      input.type,
      input.qty,
      input.reason?.trim() ?? "",
      input.orderId ?? null,
      input.scanEventId ?? null,
      Date.now(),
      actor,
    ],
  );

  for (const [locationId, qty] of nextQty) setBalance(tx, input.skuId, locationId, qty);
  recalcSku(tx, input.skuId);
  audit(tx, actor, "stock.move", "stock_movement", movementId, { type: input.type, qty: input.qty, skuId: input.skuId });
  return movementId;
}

export function applyMovement(db: Sql, input: MovementInput, actor: string): string {
  return inTx(db, (tx) => applyMovementTx(tx, input, actor));
}

export function createOrder(
  db: Sql,
  input: CreateOrderInput,
  actor: string,
): { orderId: string; shortages: { skuId: string; qty: number }[] } {
  const customerName = input.customerName.trim();
  if (customerName.length < 2) throw new DomainError("Укажите заказчика");
  assertDateRange(input.startDate, input.endDate);

  const merged = new Map<string, number>();
  for (const line of input.lines) {
    if (!line.skuId) continue;
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new DomainError("Количество в строке должно быть целым и больше нуля");
    }
    merged.set(line.skuId, (merged.get(line.skuId) ?? 0) + line.qty);
  }
  if (merged.size === 0) throw new DomainError("Добавьте хотя бы одну строку");

  for (const skuId of merged.keys()) {
    const sku = db.get(`SELECT id FROM skus WHERE id = ?`, [skuId]);
    if (!sku) throw new DomainError("В строке неизвестная номенклатура");
  }

  const orderId = newId();
  return inTx(db, (tx) => {
    tx.run(
      `INSERT INTO rental_orders (id, customer_name, start_date, end_date, status, notes, created_at, created_by, source, external_id) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
      [
        orderId,
        customerName,
        input.startDate,
        input.endDate,
        input.notes?.trim() ?? "",
        input.createdAt ?? Date.now(),
        actor,
        input.source ?? "ui",
        input.externalId ?? null,
      ],
    );
    for (const [skuId, qty] of merged) {
      tx.run(
        `INSERT INTO rental_lines (id, order_id, sku_id, qty_requested, qty_soft_reserved, qty_shortage) VALUES (?, ?, ?, ?, 0, 0)`,
        [newId(), orderId, skuId, qty],
      );
    }
    for (const skuId of merged.keys()) recalcSku(tx, skuId);
    const lines = tx.all<LineRecord>(`${LINE_SQL} WHERE order_id = ?`, [orderId]);
    audit(tx, actor, "order.create", "rental_order", orderId, { customerName });
    return {
      orderId,
      shortages: lines.filter((line) => line.qtyShortage > 0).map((line) => ({ skuId: line.skuId, qty: line.qtyShortage })),
    };
  });
}

export function setOrderStatus(db: Sql, orderId: string, status: "cancelled" | "closed", actor: string): void {
  const order = db.get<OrderRecord>(`${ORDER_SQL} WHERE id = ?`, [orderId]);
  if (!order) throw new DomainError("Заказ не найден");
  if (order.status !== "confirmed") throw new DomainError("Заказ уже завершён");

  inTx(db, (tx) => {
    tx.run(`UPDATE rental_orders SET status = ? WHERE id = ?`, [status, orderId]);
    const lines = tx.all<LineRecord>(`${LINE_SQL} WHERE order_id = ?`, [orderId]);
    tx.run(`UPDATE rental_lines SET qty_soft_reserved = 0, qty_shortage = 0 WHERE order_id = ?`, [orderId]);
    tx.run(`UPDATE shortage_signals SET status = 'closed', qty_short = 0 WHERE order_id = ?`, [orderId]);
    tx.run(`UPDATE alerts SET status = 'closed' WHERE order_id = ?`, [orderId]);
    const hires = tx.all<HireRecord>(`${HIRE_SQL} WHERE order_id = ?`, [orderId]);
    for (const hire of hires) {
      if (hire.status === "needed") tx.run(`UPDATE external_hires SET status = 'closed' WHERE id = ?`, [hire.id]);
    }
    for (const skuId of new Set(lines.map((line) => line.skuId))) recalcSku(tx, skuId);
    audit(tx, actor, "order.status", "rental_order", orderId, { status });
  });
}

export function setHireStatus(
  db: Sql,
  hireId: string,
  status: "needed" | "ordered" | "received" | "closed",
  supplierNote: string,
  actor: string,
): void {
  const hire = db.get(`SELECT id FROM external_hires WHERE id = ?`, [hireId]);
  if (!hire) throw new DomainError("Заявка на внешнюю аренду не найдена");
  const note = supplierNote.trim().slice(0, 500);
  inTx(db, (tx) => {
    tx.run(`UPDATE external_hires SET status = ?, supplier_note = ? WHERE id = ?`, [status, note, hireId]);
    audit(tx, actor, "hire.status", "external_hire", hireId, { status, supplierNote: note });
  });
}

export function ackAlert(db: Sql, alertId: string, actor: string): void {
  const alert = db.get<AlertRecord>(`${ALERT_SQL} WHERE id = ?`, [alertId]);
  if (!alert) throw new DomainError("Сигнал не найден");
  if (alert.status === "closed") throw new DomainError("Сигнал уже закрыт");
  inTx(db, (tx) => {
    tx.run(`UPDATE alerts SET status = 'ack' WHERE id = ?`, [alertId]);
    audit(tx, actor, "alert.ack", "alert", alertId, {});
  });
}

export function saveExternalHire(
  db: Sql,
  input: {
    orderId: string;
    skuId: string;
    qty: number;
    supplierNote?: string;
    status?: "needed" | "ordered" | "received" | "closed";
  },
  actor: string,
): string {
  const order = db.get(`SELECT id FROM rental_orders WHERE id = ?`, [input.orderId]);
  if (!order) throw new DomainError("Заказ не найден");
  const sku = db.get(`SELECT id FROM skus WHERE id = ?`, [input.skuId]);
  if (!sku) throw new DomainError("Номенклатура не найдена");
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new DomainError("Количество должно быть больше нуля");
  const note = input.supplierNote?.trim().slice(0, 500) ?? "";
  const status = input.status ?? "needed";

  return inTx(db, (tx) => {
    const existing = tx.get<HireRecord>(`${HIRE_SQL} WHERE order_id = ? AND sku_id = ?`, [input.orderId, input.skuId]);
    if (!existing) {
      const id = newId();
      tx.run(
        `INSERT INTO external_hires (id, sku_id, qty, order_id, alert_id, status, supplier_note, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        [id, input.skuId, input.qty, input.orderId, status, note, Date.now()],
      );
      audit(tx, actor, "hire.create", "external_hire", id, { status, qty: input.qty });
      return id;
    }
    tx.run(`UPDATE external_hires SET qty = ?, status = ?, supplier_note = ? WHERE id = ?`, [
      input.qty,
      status,
      note || existing.supplierNote,
      existing.id,
    ]);
    audit(tx, actor, "hire.update", "external_hire", existing.id, { status, qty: input.qty });
    return existing.id;
  });
}

function findSkuByCode(db: Sql, code: string): SkuRecord | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;
  return db.all<SkuRecord>(SKU_SQL).find((sku) => sku.code.toLowerCase() === normalized || sku.id.toLowerCase() === normalized);
}

function resolveScanLocations(tx: Sql, skuId: string, event: IncomingScan): { locationId: string; fromLocationId?: string } {
  if (event.direction === "move") {
    if (!event.locationId || !event.fromLocationId) {
      throw new DomainError("Для перемещения нужны location_id и from_location_id");
    }
    return { locationId: event.locationId, fromLocationId: event.fromLocationId };
  }
  if (event.locationId) return { locationId: event.locationId };
  if (event.direction === "out") {
    const row = tx.get<{ locationId: string }>(
      `SELECT location_id AS locationId FROM stock_balances WHERE sku_id = ? AND qty_on_hand > 0 ORDER BY qty_on_hand DESC LIMIT 1`,
      [skuId],
    );
    if (!row) throw new DomainError("Нет остатка для расхода");
    return { locationId: row.locationId };
  }
  const warehouse =
    tx.get<{ id: string }>(`SELECT id FROM locations WHERE kind = 'warehouse' LIMIT 1`) ??
    tx.get<{ id: string }>(`SELECT id FROM locations LIMIT 1`);
  if (!warehouse) throw new DomainError("Нет локации для прихода");
  return { locationId: warehouse.id };
}

function replay(db: Sql, eventId: string): ScanResult {
  const existing = db.get<{ result: string }>(`SELECT result FROM scan_events WHERE event_id = ?`, [eventId]);
  if (!existing) throw new DomainError("Событие скана не сохранилось");
  return { ...(JSON.parse(existing.result) as ScanResult), idempotent: true };
}

function storeScan(
  tx: Sql,
  event: IncomingScan,
  result: ScanResult,
  skuId: string | null,
  locationId: string | null,
  fromLocationId: string | null,
  createdAt: number,
): void {
  tx.run(
    `INSERT INTO scan_events (id, event_id, source, code, sku_id, direction, qty, device_id, location_id, from_location_id, meta, created_at, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      event.eventId,
      event.source,
      event.code,
      skuId,
      event.direction,
      event.qty,
      event.deviceId ?? null,
      locationId,
      fromLocationId,
      JSON.stringify(event.meta ?? {}),
      createdAt,
      JSON.stringify(result),
    ],
  );
}

function orderIdFromScan(tx: Sql, meta: IncomingScan["meta"]): string | undefined {
  const orderId = meta?.orderId;
  if (typeof orderId === "string" && orderId.trim()) return orderId.trim();
  const externalId = meta?.externalId;
  if (typeof externalId !== "string" || !externalId.trim()) return undefined;
  return tx.get<{ id: string }>(`SELECT id FROM rental_orders WHERE external_id = ?`, [externalId.trim()])?.id;
}

/** Расход скана закрывает бронь: сначала указанный заказ, затем более ранние. */
function issueReserved(tx: Sql, skuId: string, qty: number, preferredOrderId?: string): { order_id: string; qty: number }[] {
  const lines = tx.all<{ id: string; orderId: string; room: number }>(
    `SELECT l.id AS id, l.order_id AS orderId, (l.qty_requested - l.qty_issued) AS room
     FROM rental_lines l INNER JOIN rental_orders o ON o.id = l.order_id
     WHERE l.sku_id = ? AND o.status = 'confirmed' AND l.qty_issued < l.qty_requested
     ORDER BY o.created_at ASC, l.id ASC`,
    [skuId],
  );
  const ordered = preferredOrderId
    ? [...lines.filter((line) => line.orderId === preferredOrderId), ...lines.filter((line) => line.orderId !== preferredOrderId)]
    : lines;
  let left = qty;
  const applied: { order_id: string; qty: number }[] = [];
  for (const line of ordered) {
    if (left <= 0) break;
    const take = Math.min(line.room, left);
    if (take <= 0) continue;
    tx.run(`UPDATE rental_lines SET qty_issued = qty_issued + ? WHERE id = ?`, [take, line.id]);
    left -= take;
    const same = applied.find((row) => row.order_id === line.orderId);
    if (same) same.qty += take;
    else applied.push({ order_id: line.orderId, qty: take });
  }
  if (applied.length > 0) recalcSku(tx, skuId);
  return applied;
}

/** Каноническое событие скана. Повтор того же event_id не двигает остаток второй раз. */
export function ingestScan(db: Sql, event: IncomingScan, actor: string): ScanResult {
  if (!event.eventId.trim()) throw new DomainError("Нужен event_id");
  if (!Number.isInteger(event.qty) || event.qty <= 0) throw new DomainError("Количество скана должно быть больше нуля");
  const existing = db.get<{ result: string }>(`SELECT result FROM scan_events WHERE event_id = ?`, [event.eventId]);
  if (existing) return { ...(JSON.parse(existing.result) as ScanResult), idempotent: true };

  const parsedAt = event.at ? Date.parse(event.at) : Date.now();
  const createdAt = Number.isNaN(parsedAt) ? Date.now() : parsedAt;
  const sku = findSkuByCode(db, event.code);

  if (!sku) {
    const result: ScanResult = { event_id: event.eventId, status: "rejected", reason: "SKU не найден" };
    try {
      inTx(db, (tx) => storeScan(tx, event, result, null, event.locationId ?? null, event.fromLocationId ?? null, createdAt));
    } catch (error) {
      if (isUniqueError(error)) return replay(db, event.eventId);
      throw error;
    }
    return result;
  }

  try {
    return inTx(db, (tx) => {
      const again = tx.get<{ result: string }>(`SELECT result FROM scan_events WHERE event_id = ?`, [event.eventId]);
      if (again) return { ...(JSON.parse(again.result) as ScanResult), idempotent: true };
      const place = resolveScanLocations(tx, sku.id, event);
      const preferredOrderId = orderIdFromScan(tx, event.meta);
      const movementId = applyMovementTx(
        tx,
        {
          skuId: sku.id,
          type: event.direction,
          qty: event.qty,
          locationId: place.locationId,
          fromLocationId: place.fromLocationId,
          reason: `Скан ${event.source}`,
          scanEventId: event.eventId,
          orderId: preferredOrderId,
        },
        actor,
      );
      const issued = event.direction === "out" ? issueReserved(tx, sku.id, event.qty, preferredOrderId) : [];
      const alertIds = tx
        .all<{ id: string }>(`SELECT id FROM alerts WHERE sku_id = ? AND status = 'open'`, [sku.id])
        .map((alert) => alert.id);
      const result: ScanResult = {
        event_id: event.eventId,
        status: "accepted",
        movement_id: movementId,
        alert_ids: alertIds,
        issued,
      };
      storeScan(tx, event, result, sku.id, place.locationId, place.fromLocationId ?? null, createdAt);
      return result;
    });
  } catch (error) {
    if (isUniqueError(error)) return replay(db, event.eventId);
    if (error instanceof DomainError) {
      const result: ScanResult = { event_id: event.eventId, status: "rejected", reason: error.message };
      try {
        inTx(db, (tx) => storeScan(tx, event, result, sku.id, event.locationId ?? null, event.fromLocationId ?? null, createdAt));
      } catch (inner) {
        if (isUniqueError(inner)) return replay(db, event.eventId);
        throw inner;
      }
      return result;
    }
    throw error;
  }
}
