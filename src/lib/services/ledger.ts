import { randomUUID } from "node:crypto";
import { and, eq, gt, sum } from "drizzle-orm";
import { assertDateRange, todayIso } from "@/lib/dates";
import { allocateForSku } from "@/lib/domain/allocation";
import { DomainError } from "@/lib/domain/errors";
import type { AppDb } from "@/lib/db/types";
import {
  alerts,
  auditLog,
  externalHires,
  locations,
  rentalLines,
  rentalOrders,
  scanEvents,
  shortageSignals,
  skus,
  stockBalances,
  stockMovements,
} from "@/lib/db/schema";

type SkuRecord = typeof skus.$inferSelect;
type OrderRecord = typeof rentalOrders.$inferSelect;

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
};

export type ScanResult = {
  event_id: string;
  status: "accepted" | "rejected";
  reason?: string;
  movement_id?: string;
  alert_ids?: string[];
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

function inTx<T>(db: AppDb, fn: (tx: AppDb) => T): T {
  return db.transaction((tx) => fn(tx as unknown as AppDb));
}

function audit(
  tx: AppDb,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  payload: unknown,
): void {
  tx.insert(auditLog)
    .values({
      id: randomUUID(),
      actor,
      action,
      entity,
      entityId,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
    })
    .run();
}

function isUniqueError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function createSku(
  db: AppDb,
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
  const id = randomUUID();
  try {
    inTx(db, (tx) => {
      tx.insert(skus)
        .values({
          id,
          code,
          name,
          category,
          unit: input.unit?.trim() || "шт",
          trackMode: "quantity",
          description: input.description?.trim() ?? "",
        })
        .run();
      audit(tx, actor, "sku.create", "sku", id, { code, name });
    });
  } catch (error) {
    if (isUniqueError(error)) throw new DomainError("Такой код номенклатуры уже есть");
    throw error;
  }
  return id;
}

export function createLocation(
  db: AppDb,
  input: { name: string; kind: "warehouse" | "zone" | "bin"; parentId?: string },
  actor: string,
): string {
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Укажите название локации");
  if (input.parentId) {
    const parent = db.select().from(locations).where(eq(locations.id, input.parentId)).get();
    if (!parent) throw new DomainError("Родительская локация не найдена");
  }
  const id = randomUUID();
  inTx(db, (tx) => {
    tx.insert(locations)
      .values({ id, name, kind: input.kind, parentId: input.parentId || null })
      .run();
    audit(tx, actor, "location.create", "location", id, { name, kind: input.kind });
  });
  return id;
}

function balanceOf(tx: AppDb, skuId: string, locationId: string): number {
  return (
    tx
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.skuId, skuId), eq(stockBalances.locationId, locationId)))
      .get()?.qtyOnHand ?? 0
  );
}

function setBalance(tx: AppDb, skuId: string, locationId: string, qtyOnHand: number): void {
  const existing = tx
    .select()
    .from(stockBalances)
    .where(and(eq(stockBalances.skuId, skuId), eq(stockBalances.locationId, locationId)))
    .get();
  if (!existing) {
    tx.insert(stockBalances).values({ skuId, locationId, qtyOnHand, qtyReserved: 0 }).run();
    return;
  }
  tx.update(stockBalances)
    .set({ qtyOnHand })
    .where(and(eq(stockBalances.skuId, skuId), eq(stockBalances.locationId, locationId)))
    .run();
}

/**
 * Пересчёт мягких резервов SKU.
 * Закрытая вручную внешняя аренда не открывается заново, пока нехватка не падала до нуля.
 * Пока заявка в статусе needed, количество следует за текущей нехваткой.
 */
export function recalcSku(tx: AppDb, skuId: string): void {
  const sku = tx.select().from(skus).where(eq(skus.id, skuId)).get();
  if (!sku) return;

  const total = tx
    .select({ total: sum(stockBalances.qtyOnHand) })
    .from(stockBalances)
    .where(eq(stockBalances.skuId, skuId))
    .get()?.total;
  const onHand = Number(total ?? 0);

  const rows = tx
    .select({ line: rentalLines, order: rentalOrders })
    .from(rentalLines)
    .innerJoin(rentalOrders, eq(rentalLines.orderId, rentalOrders.id))
    .where(and(eq(rentalLines.skuId, skuId), eq(rentalOrders.status, "confirmed")))
    .all();

  const allocations = allocateForSku(
    onHand,
    rows.map((row) => ({
      id: row.line.id,
      qtyRequested: row.line.qtyRequested,
      startDate: row.order.startDate,
      endDate: row.order.endDate,
      createdAt: row.order.createdAt,
    })),
  );
  const byId = new Map(allocations.map((item) => [item.id, item]));

  for (const row of rows) {
    const allocation = byId.get(row.line.id);
    if (!allocation) continue;
    if (row.line.qtySoftReserved !== allocation.qtySoftReserved || row.line.qtyShortage !== allocation.qtyShortage) {
      tx.update(rentalLines)
        .set({
          qtySoftReserved: allocation.qtySoftReserved,
          qtyShortage: allocation.qtyShortage,
        })
        .where(eq(rentalLines.id, row.line.id))
        .run();
    }
    syncShortage(tx, sku, row.order, allocation.qtyShortage);
  }

  syncReservedSnapshot(tx, skuId);
}

function syncShortage(tx: AppDb, sku: SkuRecord, order: OrderRecord, qtyShortage: number): void {
  const signal = tx
    .select()
    .from(shortageSignals)
    .where(and(eq(shortageSignals.orderId, order.id), eq(shortageSignals.skuId, sku.id)))
    .get();
  const hire = tx
    .select()
    .from(externalHires)
    .where(and(eq(externalHires.orderId, order.id), eq(externalHires.skuId, sku.id)))
    .get();
  const prevShort = signal?.status === "open" ? signal.qtyShort : 0;
  const now = Date.now();

  if (qtyShortage > 0) {
    if (!signal) {
      tx.insert(shortageSignals)
        .values({
          id: randomUUID(),
          skuId: sku.id,
          orderId: order.id,
          startDate: order.startDate,
          endDate: order.endDate,
          qtyShort: qtyShortage,
          status: "open",
        })
        .run();
    } else {
      tx.update(shortageSignals)
        .set({
          qtyShort: qtyShortage,
          status: "open",
          startDate: order.startDate,
          endDate: order.endDate,
        })
        .where(eq(shortageSignals.id, signal.id))
        .run();
    }

    let hireId = hire?.id ?? null;
    if (!hire) {
      hireId = randomUUID();
      tx.insert(externalHires)
        .values({
          id: hireId,
          skuId: sku.id,
          qty: qtyShortage,
          orderId: order.id,
          alertId: null,
          status: "needed",
          supplierNote: "",
          createdAt: now,
        })
        .run();
    } else if (hire.status === "needed") {
      tx.update(externalHires).set({ qty: qtyShortage }).where(eq(externalHires.id, hire.id)).run();
    } else if (hire.status === "closed" && prevShort === 0) {
      tx.update(externalHires)
        .set({ qty: qtyShortage, status: "needed" })
        .where(eq(externalHires.id, hire.id))
        .run();
    }

    const message = `Нехватка ${sku.code}: ${qtyShortage} ${sku.unit} по заказу «${order.customerName}». Можно арендовать снаружи.`;
    const existingAlerts = tx
      .select()
      .from(alerts)
      .where(and(eq(alerts.orderId, order.id), eq(alerts.skuId, sku.id), eq(alerts.type, "shortage")))
      .all();

    if (existingAlerts.length === 0) {
      const alertId = randomUUID();
      tx.insert(alerts)
        .values({
          id: alertId,
          type: "shortage",
          status: "open",
          skuId: sku.id,
          orderId: order.id,
          externalHireId: hireId,
          message,
          createdAt: now,
        })
        .run();
      if (hireId) {
        tx.update(externalHires).set({ alertId }).where(eq(externalHires.id, hireId)).run();
      }
    } else {
      const [first, ...rest] = existingAlerts;
      if (!first) return;
      tx.update(alerts)
        .set({
          status: first.status === "ack" ? "ack" : "open",
          message,
          externalHireId: hireId,
        })
        .where(eq(alerts.id, first.id))
        .run();
      for (const extra of rest) {
        tx.update(alerts).set({ status: "closed" }).where(eq(alerts.id, extra.id)).run();
      }
      if (hireId) {
        tx.update(externalHires).set({ alertId: first.id }).where(eq(externalHires.id, hireId)).run();
      }
    }
    return;
  }

  if (signal && signal.status !== "closed") {
    tx.update(shortageSignals)
      .set({ qtyShort: 0, status: "closed" })
      .where(eq(shortageSignals.id, signal.id))
      .run();
  }
  if (hire?.status === "needed") {
    tx.update(externalHires).set({ status: "closed", qty: 0 }).where(eq(externalHires.id, hire.id)).run();
  }
  const openAlerts = tx
    .select()
    .from(alerts)
    .where(and(eq(alerts.orderId, order.id), eq(alerts.skuId, sku.id), eq(alerts.type, "shortage")))
    .all();
  for (const alert of openAlerts) {
    if (alert.status !== "closed") {
      tx.update(alerts).set({ status: "closed" }).where(eq(alerts.id, alert.id)).run();
    }
  }
}

/** Снимок резерва на сегодня: целиком на локации с наибольшим остатком. Истина по строкам заказа. */
function syncReservedSnapshot(tx: AppDb, skuId: string): void {
  const today = todayIso();
  const lines = tx
    .select({ line: rentalLines, order: rentalOrders })
    .from(rentalLines)
    .innerJoin(rentalOrders, eq(rentalLines.orderId, rentalOrders.id))
    .where(and(eq(rentalLines.skuId, skuId), eq(rentalOrders.status, "confirmed")))
    .all();
  const reservedToday = lines
    .filter((row) => row.order.startDate <= today && today <= row.order.endDate)
    .reduce((sumQty, row) => sumQty + row.line.qtySoftReserved, 0);

  const balances = tx
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.skuId, skuId))
    .all()
    .sort((a, b) => b.qtyOnHand - a.qtyOnHand);

  balances.forEach((row, index) => {
    tx.update(stockBalances)
      .set({ qtyReserved: index === 0 ? reservedToday : 0 })
      .where(and(eq(stockBalances.skuId, skuId), eq(stockBalances.locationId, row.locationId)))
      .run();
  });
}

function applyMovementTx(tx: AppDb, input: MovementInput, actor: string): string {
  const sku = tx.select().from(skus).where(eq(skus.id, input.skuId)).get();
  if (!sku) throw new DomainError("Номенклатура не найдена");
  const location = tx.select().from(locations).where(eq(locations.id, input.locationId)).get();
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
    const source = tx.select().from(locations).where(eq(locations.id, input.fromLocationId)).get();
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

  const movementId = randomUUID();
  tx.insert(stockMovements)
    .values({
      id: movementId,
      skuId: input.skuId,
      locationId: input.locationId,
      fromLocationId: input.fromLocationId ?? null,
      type: input.type,
      qty: input.qty,
      reason: input.reason?.trim() ?? "",
      orderId: input.orderId ?? null,
      scanEventId: input.scanEventId ?? null,
      createdAt: Date.now(),
      createdBy: actor,
    })
    .run();

  for (const [locationId, qty] of nextQty) {
    setBalance(tx, input.skuId, locationId, qty);
  }
  recalcSku(tx, input.skuId);
  audit(tx, actor, "stock.move", "stock_movement", movementId, {
    type: input.type,
    qty: input.qty,
    skuId: input.skuId,
  });
  return movementId;
}

export function applyMovement(db: AppDb, input: MovementInput, actor: string): string {
  return inTx(db, (tx) => applyMovementTx(tx, input, actor));
}

export function createOrder(
  db: AppDb,
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
    const sku = db.select().from(skus).where(eq(skus.id, skuId)).get();
    if (!sku) throw new DomainError("В строке неизвестная номенклатура");
  }

  const orderId = randomUUID();
  return inTx(db, (tx) => {
    tx.insert(rentalOrders)
      .values({
        id: orderId,
        customerName,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "confirmed",
        notes: input.notes?.trim() ?? "",
        createdAt: input.createdAt ?? Date.now(),
        createdBy: actor,
      })
      .run();
    for (const [skuId, qty] of merged) {
      tx.insert(rentalLines)
        .values({
          id: randomUUID(),
          orderId,
          skuId,
          qtyRequested: qty,
          qtySoftReserved: 0,
          qtyShortage: 0,
        })
        .run();
    }
    for (const skuId of merged.keys()) recalcSku(tx, skuId);
    const lines = tx.select().from(rentalLines).where(eq(rentalLines.orderId, orderId)).all();
    audit(tx, actor, "order.create", "rental_order", orderId, { customerName });
    return {
      orderId,
      shortages: lines
        .filter((line) => line.qtyShortage > 0)
        .map((line) => ({ skuId: line.skuId, qty: line.qtyShortage })),
    };
  });
}

export function setOrderStatus(db: AppDb, orderId: string, status: "cancelled" | "closed", actor: string): void {
  const order = db.select().from(rentalOrders).where(eq(rentalOrders.id, orderId)).get();
  if (!order) throw new DomainError("Заказ не найден");
  if (order.status !== "confirmed") throw new DomainError("Заказ уже завершён");

  inTx(db, (tx) => {
    tx.update(rentalOrders).set({ status }).where(eq(rentalOrders.id, orderId)).run();
    const lines = tx.select().from(rentalLines).where(eq(rentalLines.orderId, orderId)).all();
    tx.update(rentalLines)
      .set({ qtySoftReserved: 0, qtyShortage: 0 })
      .where(eq(rentalLines.orderId, orderId))
      .run();
    tx.update(shortageSignals)
      .set({ status: "closed", qtyShort: 0 })
      .where(eq(shortageSignals.orderId, orderId))
      .run();
    tx.update(alerts).set({ status: "closed" }).where(eq(alerts.orderId, orderId)).run();
    const hires = tx.select().from(externalHires).where(eq(externalHires.orderId, orderId)).all();
    for (const hire of hires) {
      if (hire.status === "needed") {
        tx.update(externalHires).set({ status: "closed" }).where(eq(externalHires.id, hire.id)).run();
      }
    }
    for (const skuId of new Set(lines.map((line) => line.skuId))) {
      recalcSku(tx, skuId);
    }
    audit(tx, actor, "order.status", "rental_order", orderId, { status });
  });
}

export function setHireStatus(
  db: AppDb,
  hireId: string,
  status: "needed" | "ordered" | "received" | "closed",
  supplierNote: string,
  actor: string,
): void {
  const hire = db.select().from(externalHires).where(eq(externalHires.id, hireId)).get();
  if (!hire) throw new DomainError("Заявка на внешнюю аренду не найдена");
  const note = supplierNote.trim().slice(0, 500);
  inTx(db, (tx) => {
    tx.update(externalHires).set({ status, supplierNote: note }).where(eq(externalHires.id, hireId)).run();
    audit(tx, actor, "hire.status", "external_hire", hireId, { status, supplierNote: note });
  });
}

export function ackAlert(db: AppDb, alertId: string, actor: string): void {
  const alert = db.select().from(alerts).where(eq(alerts.id, alertId)).get();
  if (!alert) throw new DomainError("Сигнал не найден");
  if (alert.status === "closed") throw new DomainError("Сигнал уже закрыт");
  inTx(db, (tx) => {
    tx.update(alerts).set({ status: "ack" }).where(eq(alerts.id, alertId)).run();
    audit(tx, actor, "alert.ack", "alert", alertId, {});
  });
}

export function saveExternalHire(
  db: AppDb,
  input: {
    orderId: string;
    skuId: string;
    qty: number;
    supplierNote?: string;
    status?: "needed" | "ordered" | "received" | "closed";
  },
  actor: string,
): string {
  const order = db.select().from(rentalOrders).where(eq(rentalOrders.id, input.orderId)).get();
  if (!order) throw new DomainError("Заказ не найден");
  const sku = db.select().from(skus).where(eq(skus.id, input.skuId)).get();
  if (!sku) throw new DomainError("Номенклатура не найдена");
  if (!Number.isInteger(input.qty) || input.qty <= 0) throw new DomainError("Количество должно быть больше нуля");
  const note = input.supplierNote?.trim().slice(0, 500) ?? "";
  const status = input.status ?? "needed";

  return inTx(db, (tx) => {
    const existing = tx
      .select()
      .from(externalHires)
      .where(and(eq(externalHires.orderId, input.orderId), eq(externalHires.skuId, input.skuId)))
      .get();
    if (!existing) {
      const id = randomUUID();
      tx.insert(externalHires)
        .values({
          id,
          skuId: input.skuId,
          qty: input.qty,
          orderId: input.orderId,
          alertId: null,
          status,
          supplierNote: note,
          createdAt: Date.now(),
        })
        .run();
      audit(tx, actor, "hire.create", "external_hire", id, { status, qty: input.qty });
      return id;
    }
    tx.update(externalHires)
      .set({ qty: input.qty, status, supplierNote: note || existing.supplierNote })
      .where(eq(externalHires.id, existing.id))
      .run();
    audit(tx, actor, "hire.update", "external_hire", existing.id, { status, qty: input.qty });
    return existing.id;
  });
}

function findSkuByCode(db: AppDb, code: string): SkuRecord | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;
  return db
    .select()
    .from(skus)
    .all()
    .find((sku) => sku.code.toLowerCase() === normalized || sku.id.toLowerCase() === normalized);
}

function resolveScanLocations(
  tx: AppDb,
  skuId: string,
  event: IncomingScan,
): { locationId: string; fromLocationId?: string } {
  if (event.direction === "move") {
    if (!event.locationId || !event.fromLocationId) {
      throw new DomainError("Для перемещения нужны location_id и from_location_id");
    }
    return { locationId: event.locationId, fromLocationId: event.fromLocationId };
  }
  if (event.locationId) return { locationId: event.locationId };
  if (event.direction === "out") {
    const row = tx
      .select()
      .from(stockBalances)
      .where(and(eq(stockBalances.skuId, skuId), gt(stockBalances.qtyOnHand, 0)))
      .all()
      .sort((a, b) => b.qtyOnHand - a.qtyOnHand)[0];
    if (!row) throw new DomainError("Нет остатка для расхода");
    return { locationId: row.locationId };
  }
  const warehouse =
    tx.select().from(locations).where(eq(locations.kind, "warehouse")).get() ??
    tx.select().from(locations).get();
  if (!warehouse) throw new DomainError("Нет локации для прихода");
  return { locationId: warehouse.id };
}

function replay(db: AppDb, eventId: string): ScanResult {
  const existing = db.select().from(scanEvents).where(eq(scanEvents.eventId, eventId)).get();
  if (!existing) throw new DomainError("Событие скана не сохранилось");
  return { ...(JSON.parse(existing.result) as ScanResult), idempotent: true };
}

function storeScan(
  tx: AppDb,
  event: IncomingScan,
  result: ScanResult,
  skuId: string | null,
  locationId: string | null,
  fromLocationId: string | null,
  createdAt: number,
): void {
  tx.insert(scanEvents)
    .values({
      id: randomUUID(),
      eventId: event.eventId,
      source: event.source,
      code: event.code,
      skuId,
      direction: event.direction,
      qty: event.qty,
      deviceId: event.deviceId ?? null,
      locationId,
      fromLocationId,
      meta: JSON.stringify(event.meta ?? {}),
      createdAt,
      result: JSON.stringify(result),
    })
    .run();
}

/** Каноническое событие скана. Повтор того же event_id не двигает остаток второй раз. */
export function ingestScan(db: AppDb, event: IncomingScan, actor: string): ScanResult {
  if (!event.eventId.trim()) throw new DomainError("Нужен event_id");
  if (!Number.isInteger(event.qty) || event.qty <= 0) throw new DomainError("Количество скана должно быть больше нуля");
  const existing = db.select().from(scanEvents).where(eq(scanEvents.eventId, event.eventId)).get();
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
      const again = tx.select().from(scanEvents).where(eq(scanEvents.eventId, event.eventId)).get();
      if (again) return { ...(JSON.parse(again.result) as ScanResult), idempotent: true };
      const place = resolveScanLocations(tx, sku.id, event);
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
        },
        actor,
      );
      const alertIds = tx
        .select()
        .from(alerts)
        .where(and(eq(alerts.skuId, sku.id), eq(alerts.status, "open")))
        .all()
        .map((alert) => alert.id);
      const result: ScanResult = {
        event_id: event.eventId,
        status: "accepted",
        movement_id: movementId,
        alert_ids: alertIds,
      };
      storeScan(tx, event, result, sku.id, place.locationId, place.fromLocationId ?? null, createdAt);
      return result;
    });
  } catch (error) {
    if (isUniqueError(error)) return replay(db, event.eventId);
    if (error instanceof DomainError) {
      const result: ScanResult = { event_id: event.eventId, status: "rejected", reason: error.message };
      try {
        inTx(db, (tx) =>
          storeScan(tx, event, result, sku.id, event.locationId ?? null, event.fromLocationId ?? null, createdAt),
        );
      } catch (inner) {
        if (isUniqueError(inner)) return replay(db, event.eventId);
        throw inner;
      }
      return result;
    }
    throw error;
  }
}
