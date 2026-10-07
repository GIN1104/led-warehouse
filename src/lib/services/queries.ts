import { and, desc, eq } from "drizzle-orm";
import { todayIso } from "@/lib/dates";
import type { AppDb } from "@/lib/db/types";
import {
  alerts,
  externalHires,
  locations,
  rentalLines,
  rentalOrders,
  scanEvents,
  skus,
  stockBalances,
  stockMovements,
  users,
} from "@/lib/db/schema";

export function listUsers(db: AppDb) {
  return db.select().from(users).orderBy(users.name).all();
}

export function listLocations(db: AppDb) {
  const rows = db.select().from(locations).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows
    .map((row) => ({
      ...row,
      parentName: row.parentId ? (byId.get(row.parentId)?.name ?? null) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function listSkuSummaries(db: AppDb) {
  const skuRows = db.select().from(skus).orderBy(skus.code).all();
  const balances = db.select().from(stockBalances).all();
  const today = todayIso();
  const lines = db
    .select({
      skuId: rentalLines.skuId,
      qtySoftReserved: rentalLines.qtySoftReserved,
      qtyShortage: rentalLines.qtyShortage,
      startDate: rentalOrders.startDate,
      endDate: rentalOrders.endDate,
      status: rentalOrders.status,
    })
    .from(rentalLines)
    .innerJoin(rentalOrders, eq(rentalLines.orderId, rentalOrders.id))
    .all();

  return skuRows.map((sku) => {
    const ownBalances = balances.filter((row) => row.skuId === sku.id);
    const onHand = ownBalances.reduce((sumQty, row) => sumQty + row.qtyOnHand, 0);
    const active = lines.filter((row) => row.skuId === sku.id && row.status === "confirmed");
    const reservedToday = active
      .filter((row) => row.startDate <= today && today <= row.endDate)
      .reduce((sumQty, row) => sumQty + row.qtySoftReserved, 0);
    const shortage = active.reduce((sumQty, row) => sumQty + row.qtyShortage, 0);
    return {
      ...sku,
      onHand,
      reservedToday,
      availableToday: onHand - reservedToday,
      shortage,
    };
  });
}

export function listLocationBalances(db: AppDb) {
  return db
    .select({
      skuId: stockBalances.skuId,
      skuCode: skus.code,
      skuName: skus.name,
      unit: skus.unit,
      locationId: stockBalances.locationId,
      locationName: locations.name,
      qtyOnHand: stockBalances.qtyOnHand,
      qtyReserved: stockBalances.qtyReserved,
    })
    .from(stockBalances)
    .innerJoin(skus, eq(stockBalances.skuId, skus.id))
    .innerJoin(locations, eq(stockBalances.locationId, locations.id))
    .orderBy(skus.code)
    .all();
}

export function listMovements(db: AppDb, limit = 12) {
  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      qty: stockMovements.qty,
      reason: stockMovements.reason,
      createdAt: stockMovements.createdAt,
      skuCode: skus.code,
      locationName: locations.name,
    })
    .from(stockMovements)
    .innerJoin(skus, eq(stockMovements.skuId, skus.id))
    .innerJoin(locations, eq(stockMovements.locationId, locations.id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit)
    .all();
}

export function listOrders(db: AppDb) {
  const orders = db.select().from(rentalOrders).orderBy(desc(rentalOrders.createdAt)).all();
  const lines = db.select().from(rentalLines).all();
  return orders.map((order) => {
    const own = lines.filter((line) => line.orderId === order.id);
    return {
      ...order,
      lineCount: own.length,
      shortage: own.reduce((sumQty, line) => sumQty + line.qtyShortage, 0),
    };
  });
}

export function getOrderDetail(db: AppDb, orderId: string) {
  const order = db.select().from(rentalOrders).where(eq(rentalOrders.id, orderId)).get();
  if (!order) return null;
  const lines = db
    .select({
      id: rentalLines.id,
      skuId: rentalLines.skuId,
      code: skus.code,
      name: skus.name,
      unit: skus.unit,
      qtyRequested: rentalLines.qtyRequested,
      qtySoftReserved: rentalLines.qtySoftReserved,
      qtyShortage: rentalLines.qtyShortage,
    })
    .from(rentalLines)
    .innerJoin(skus, eq(rentalLines.skuId, skus.id))
    .where(eq(rentalLines.orderId, orderId))
    .all();
  const hires = db
    .select({
      id: externalHires.id,
      skuId: externalHires.skuId,
      code: skus.code,
      qty: externalHires.qty,
      status: externalHires.status,
      supplierNote: externalHires.supplierNote,
    })
    .from(externalHires)
    .innerJoin(skus, eq(externalHires.skuId, skus.id))
    .where(eq(externalHires.orderId, orderId))
    .all();
  return { order, lines, hires };
}

export function listAlerts(db: AppDb, status?: "open" | "ack" | "closed") {
  const rows = db
    .select({
      id: alerts.id,
      type: alerts.type,
      status: alerts.status,
      message: alerts.message,
      createdAt: alerts.createdAt,
      orderId: alerts.orderId,
      skuId: alerts.skuId,
      customerName: rentalOrders.customerName,
    })
    .from(alerts)
    .leftJoin(rentalOrders, eq(alerts.orderId, rentalOrders.id))
    .orderBy(desc(alerts.createdAt))
    .all();
  return status ? rows.filter((row) => row.status === status) : rows;
}

export function listExternalHires(db: AppDb) {
  return db
    .select({
      id: externalHires.id,
      qty: externalHires.qty,
      status: externalHires.status,
      supplierNote: externalHires.supplierNote,
      createdAt: externalHires.createdAt,
      orderId: externalHires.orderId,
      customerName: rentalOrders.customerName,
      skuCode: skus.code,
      skuName: skus.name,
      unit: skus.unit,
    })
    .from(externalHires)
    .innerJoin(rentalOrders, eq(externalHires.orderId, rentalOrders.id))
    .innerJoin(skus, eq(externalHires.skuId, skus.id))
    .orderBy(desc(externalHires.createdAt))
    .all();
}

export function listScanEvents(db: AppDb, limit = 12) {
  return db.select().from(scanEvents).orderBy(desc(scanEvents.createdAt)).limit(limit).all();
}

export function getDashboard(db: AppDb) {
  const skuRows = listSkuSummaries(db);
  const orders = listOrders(db);
  const openOrders = orders.filter((order) => order.status === "confirmed");
  const alertRows = listAlerts(db, "open");
  const hires = listExternalHires(db);
  return {
    skuCount: skuRows.length,
    openOrders: openOrders.length,
    openAlerts: alertRows.length,
    hiresNeeded: hires.filter((hire) => hire.status === "needed").length,
    shortageUnits: openOrders.reduce((sumQty, order) => sumQty + order.shortage, 0),
    alerts: alertRows.slice(0, 5),
    orders: openOrders.slice(0, 5),
    fullyReserved: skuRows.filter((sku) => sku.onHand > 0 && sku.availableToday === 0),
  };
}

export function listOpenAlertsForApi(db: AppDb) {
  return db.select().from(alerts).where(eq(alerts.status, "open")).all();
}

export function assertOrderLine(db: AppDb, orderId: string, skuId: string) {
  return db
    .select()
    .from(rentalLines)
    .where(and(eq(rentalLines.orderId, orderId), eq(rentalLines.skuId, skuId)))
    .get();
}
