import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Модель фазы 1. Имена сущностей совпадают с планом в docs/architecture-plan.md. */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role", { enum: ["warehouse", "logistics", "manager", "admin"] }).notNull(),
});

export const skus = sqliteTable("skus", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull().default("шт"),
  trackMode: text("track_mode").notNull().default("quantity"),
  description: text("description").notNull().default(""),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["warehouse", "zone", "bin"] }).notNull(),
  parentId: text("parent_id"),
});

export const stockBalances = sqliteTable("stock_balances", {
  skuId: text("sku_id").notNull(),
  locationId: text("location_id").notNull(),
  qtyOnHand: integer("qty_on_hand").notNull().default(0),
  qtyReserved: integer("qty_reserved").notNull().default(0),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  skuId: text("sku_id").notNull(),
  locationId: text("location_id").notNull(),
  fromLocationId: text("from_location_id"),
  type: text("type", { enum: ["in", "out", "adjust", "move"] }).notNull(),
  qty: integer("qty").notNull(),
  reason: text("reason").notNull().default(""),
  orderId: text("order_id"),
  scanEventId: text("scan_event_id"),
  createdAt: integer("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export const rentalOrders = sqliteTable("rental_orders", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status", { enum: ["confirmed", "cancelled", "closed"] }).notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  createdBy: text("created_by").notNull(),
});

export const rentalLines = sqliteTable("rental_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  skuId: text("sku_id").notNull(),
  qtyRequested: integer("qty_requested").notNull(),
  qtySoftReserved: integer("qty_soft_reserved").notNull(),
  qtyShortage: integer("qty_shortage").notNull().default(0),
});

export const shortageSignals = sqliteTable(
  "shortage_signals",
  {
    id: text("id").primaryKey(),
    skuId: text("sku_id").notNull(),
    orderId: text("order_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    qtyShort: integer("qty_short").notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
  },
  (table) => [uniqueIndex("uq_signal_order_sku").on(table.orderId, table.skuId)],
);

export const externalHires = sqliteTable(
  "external_hires",
  {
    id: text("id").primaryKey(),
    skuId: text("sku_id").notNull(),
    qty: integer("qty").notNull(),
    orderId: text("order_id").notNull(),
    alertId: text("alert_id"),
    status: text("status", { enum: ["needed", "ordered", "received", "closed"] }).notNull(),
    supplierNote: text("supplier_note").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_hire_order_sku").on(table.orderId, table.skuId)],
);

export const scanEvents = sqliteTable("scan_events", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  source: text("source").notNull(),
  code: text("code").notNull(),
  skuId: text("sku_id"),
  direction: text("direction", { enum: ["in", "out", "move"] }).notNull(),
  qty: integer("qty").notNull(),
  deviceId: text("device_id"),
  locationId: text("location_id"),
  fromLocationId: text("from_location_id"),
  meta: text("meta").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
  result: text("result").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["shortage", "overbook_soft", "external_hire_needed"] }).notNull(),
  status: text("status", { enum: ["open", "ack", "closed"] }).notNull(),
  skuId: text("sku_id"),
  orderId: text("order_id"),
  externalHireId: text("external_hire_id"),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});
