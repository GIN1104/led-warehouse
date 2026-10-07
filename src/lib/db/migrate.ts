import type { Sql } from "@/lib/db/sql";

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('warehouse', 'logistics', 'manager', 'admin'))
);

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  track_mode TEXT NOT NULL DEFAULT 'quantity',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warehouse', 'zone', 'bin')),
  parent_id TEXT REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS stock_balances (
  sku_id TEXT NOT NULL REFERENCES skus(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sku_id, location_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  from_location_id TEXT REFERENCES locations(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjust', 'move')),
  qty INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  order_id TEXT,
  scan_event_id TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'closed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty_requested INTEGER NOT NULL,
  qty_soft_reserved INTEGER NOT NULL,
  qty_shortage INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shortage_signals (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  qty_short INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS external_hires (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty INTEGER NOT NULL,
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  alert_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('needed', 'ordered', 'received', 'closed')),
  supplier_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  code TEXT NOT NULL,
  sku_id TEXT REFERENCES skus(id),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'move')),
  qty INTEGER NOT NULL,
  device_id TEXT,
  location_id TEXT REFERENCES locations(id),
  from_location_id TEXT REFERENCES locations(id),
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  result TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('shortage', 'overbook_soft', 'external_hire_needed')),
  status TEXT NOT NULL CHECK (status IN ('open', 'ack', 'closed')),
  sku_id TEXT,
  order_id TEXT,
  external_hire_id TEXT,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_signal_order_sku ON shortage_signals(order_id, sku_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hire_order_sku ON external_hires(order_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_lines_order ON rental_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_lines_sku ON rental_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
`;

export function migrate(db: Sql): void {
  db.exec(SQL);
}
