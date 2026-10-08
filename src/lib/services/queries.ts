import { todayIso } from "@/lib/dates";
import type { Sql } from "@/lib/db/sql";

export type Role = "warehouse" | "logistics" | "manager" | "admin";

export type UserRow = { id: string; name: string; role: Role };

export function listUsers(db: Sql): UserRow[] {
  return db.all<UserRow>(`SELECT id, name, role FROM users ORDER BY name`);
}

export function listLocations(db: Sql) {
  const rows = db.all<{ id: string; name: string; kind: "warehouse" | "zone" | "bin"; parentId: string | null }>(
    `SELECT id, name, kind, parent_id AS parentId FROM locations`,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows
    .map((row) => ({
      ...row,
      parentName: row.parentId ? (byId.get(row.parentId)?.name ?? null) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function listSkuSummaries(db: Sql) {
  const skuRows = db.all<{
    id: string;
    code: string;
    name: string;
    category: string;
    unit: string;
    trackMode: string;
    description: string;
  }>(`SELECT id, code, name, category, unit, track_mode AS trackMode, description FROM skus ORDER BY code`);
  const balances = db.all<{ skuId: string; qtyOnHand: number }>(
    `SELECT sku_id AS skuId, qty_on_hand AS qtyOnHand FROM stock_balances`,
  );
  const today = todayIso();
  const lines = db.all<{
    skuId: string;
    qtySoftReserved: number;
    qtyShortage: number;
    startDate: string;
    endDate: string;
    status: string;
  }>(
    `SELECT l.sku_id AS skuId, l.qty_soft_reserved AS qtySoftReserved, l.qty_shortage AS qtyShortage,
            o.start_date AS startDate, o.end_date AS endDate, o.status AS status
     FROM rental_lines l INNER JOIN rental_orders o ON o.id = l.order_id`,
  );

  return skuRows.map((sku) => {
    const onHand = balances.filter((row) => row.skuId === sku.id).reduce((sumQty, row) => sumQty + row.qtyOnHand, 0);
    const active = lines.filter((row) => row.skuId === sku.id && row.status === "confirmed");
    const reservedToday = active
      .filter((row) => row.startDate <= today && today <= row.endDate)
      .reduce((sumQty, row) => sumQty + row.qtySoftReserved, 0);
    const shortage = active.reduce((sumQty, row) => sumQty + row.qtyShortage, 0);
    return { ...sku, onHand, reservedToday, availableToday: onHand - reservedToday, shortage };
  });
}

export function listLocationBalances(db: Sql) {
  return db.all<{
    skuId: string;
    skuCode: string;
    skuName: string;
    unit: string;
    locationId: string;
    locationName: string;
    qtyOnHand: number;
    qtyReserved: number;
  }>(
    `SELECT b.sku_id AS skuId, s.code AS skuCode, s.name AS skuName, s.unit AS unit,
            b.location_id AS locationId, l.name AS locationName, b.qty_on_hand AS qtyOnHand, b.qty_reserved AS qtyReserved
     FROM stock_balances b
     INNER JOIN skus s ON s.id = b.sku_id
     INNER JOIN locations l ON l.id = b.location_id
     ORDER BY s.code`,
  );
}

export function listMovements(db: Sql, limit = 12) {
  return db.all<{
    id: string;
    type: "in" | "out" | "adjust" | "move";
    qty: number;
    reason: string;
    createdAt: number;
    skuCode: string;
    locationName: string;
  }>(
    `SELECT m.id AS id, m.type AS type, m.qty AS qty, m.reason AS reason, m.created_at AS createdAt,
            s.code AS skuCode, l.name AS locationName
     FROM stock_movements m
     INNER JOIN skus s ON s.id = m.sku_id
     INNER JOIN locations l ON l.id = m.location_id
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export function listOrders(db: Sql) {
  const orders = db.all<{
    id: string;
    customerName: string;
    startDate: string;
    endDate: string;
    status: "confirmed" | "cancelled" | "closed";
    notes: string;
    createdAt: number;
    createdBy: string;
    source: string;
  }>(
    `SELECT id, customer_name AS customerName, start_date AS startDate, end_date AS endDate, status, notes, created_at AS createdAt, created_by AS createdBy, source
     FROM rental_orders ORDER BY created_at DESC`,
  );
  const lines = db.all<{ orderId: string; qtyShortage: number; qtyIssued: number }>(
    `SELECT order_id AS orderId, qty_shortage AS qtyShortage, qty_issued AS qtyIssued FROM rental_lines`,
  );
  return orders.map((order) => {
    const own = lines.filter((line) => line.orderId === order.id);
    return {
      ...order,
      lineCount: own.length,
      shortage: own.reduce((sumQty, line) => sumQty + line.qtyShortage, 0),
      issued: own.reduce((sumQty, line) => sumQty + line.qtyIssued, 0),
    };
  });
}

export function getOrderDetail(db: Sql, orderId: string) {
  const order = db.get<{
    id: string;
    customerName: string;
    startDate: string;
    endDate: string;
    status: "confirmed" | "cancelled" | "closed";
    notes: string;
    createdAt: number;
    createdBy: string;
    source: string;
    externalId: string | null;
  }>(
    `SELECT id, customer_name AS customerName, start_date AS startDate, end_date AS endDate, status, notes, created_at AS createdAt, created_by AS createdBy, source, external_id AS externalId
     FROM rental_orders WHERE id = ?`,
    [orderId],
  );
  if (!order) return null;
  const lines = db.all<{
    id: string;
    skuId: string;
    code: string;
    name: string;
    unit: string;
    qtyRequested: number;
    qtySoftReserved: number;
    qtyShortage: number;
    qtyIssued: number;
  }>(
    `SELECT l.id AS id, l.sku_id AS skuId, s.code AS code, s.name AS name, s.unit AS unit,
            l.qty_requested AS qtyRequested, l.qty_soft_reserved AS qtySoftReserved, l.qty_shortage AS qtyShortage,
            l.qty_issued AS qtyIssued
     FROM rental_lines l INNER JOIN skus s ON s.id = l.sku_id WHERE l.order_id = ?`,
    [orderId],
  );
  const hires = db.all<{
    id: string;
    skuId: string;
    code: string;
    qty: number;
    status: "needed" | "ordered" | "received" | "closed";
    supplierNote: string;
  }>(
    `SELECT h.id AS id, h.sku_id AS skuId, s.code AS code, h.qty AS qty, h.status AS status, h.supplier_note AS supplierNote
     FROM external_hires h INNER JOIN skus s ON s.id = h.sku_id WHERE h.order_id = ?`,
    [orderId],
  );
  return { order, lines, hires };
}

export function listAlerts(db: Sql, status?: "open" | "ack" | "closed") {
  const rows = db.all<{
    id: string;
    type: "shortage" | "overbook_soft" | "external_hire_needed";
    status: "open" | "ack" | "closed";
    message: string;
    createdAt: number;
    orderId: string | null;
    skuId: string | null;
    customerName: string | null;
    skuCode: string | null;
    unit: string | null;
    qtyShort: number | null;
  }>(
    `SELECT a.id AS id, a.type AS type, a.status AS status, a.message AS message, a.created_at AS createdAt,
            a.order_id AS orderId, a.sku_id AS skuId, o.customer_name AS customerName,
            s.code AS skuCode, s.unit AS unit, g.qty_short AS qtyShort
     FROM alerts a
     LEFT JOIN rental_orders o ON o.id = a.order_id
     LEFT JOIN skus s ON s.id = a.sku_id
     LEFT JOIN shortage_signals g ON g.order_id = a.order_id AND g.sku_id = a.sku_id
     ORDER BY a.created_at DESC`,
  );
  return status ? rows.filter((row) => row.status === status) : rows;
}

export function listExternalHires(db: Sql) {
  return db.all<{
    id: string;
    qty: number;
    status: "needed" | "ordered" | "received" | "closed";
    supplierNote: string;
    createdAt: number;
    orderId: string;
    customerName: string;
    skuCode: string;
    skuName: string;
    unit: string;
  }>(
    `SELECT h.id AS id, h.qty AS qty, h.status AS status, h.supplier_note AS supplierNote, h.created_at AS createdAt,
            h.order_id AS orderId, o.customer_name AS customerName, s.code AS skuCode, s.name AS skuName, s.unit AS unit
     FROM external_hires h
     INNER JOIN rental_orders o ON o.id = h.order_id
     INNER JOIN skus s ON s.id = h.sku_id
     ORDER BY h.created_at DESC`,
  );
}

export function listScanEvents(db: Sql, limit = 12) {
  return db.all<{
    id: string;
    eventId: string;
    source: string;
    code: string;
    direction: string;
    qty: number;
    createdAt: number;
    result: string;
  }>(
    `SELECT id, event_id AS eventId, source, code, direction, qty, created_at AS createdAt, result
     FROM scan_events ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export function getDashboard(db: Sql) {
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
