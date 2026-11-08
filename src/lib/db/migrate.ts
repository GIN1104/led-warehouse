import { normalizeEquipmentName } from "@/lib/domain/sku-code";
import type { Sql } from "@/lib/db/sql";
import { ensureKitsLinkedToCatalog, fixKitLeptopTypo, seedDefaultKitsIfEmpty } from "@/lib/services/kits";
import { ensureDefaultRoleStockEdit } from "@/lib/services/people";

export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('warehouse', 'logistics', 'manager', 'admin', 'driver')),
  email TEXT,
  phone TEXT,
  telegram_username TEXT,
  telegram_chat_id TEXT
);

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  track_mode TEXT NOT NULL DEFAULT 'quantity',
  description TEXT NOT NULL DEFAULT '',
  family_id TEXT REFERENCES product_families(id),
  name_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warehouse', 'zone', 'bin', 'site')),
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
  created_by TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ui',
  external_id TEXT,
  mount_date TEXT,
  show_start TEXT,
  show_end TEXT,
  demount_date TEXT,
  phase TEXT NOT NULL DEFAULT 'planning'
);

CREATE TABLE IF NOT EXISTS rental_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty_requested INTEGER NOT NULL,
  qty_soft_reserved INTEGER NOT NULL,
  qty_shortage INTEGER NOT NULL DEFAULT 0,
  qty_issued INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS ledger_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS work_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  worker_id TEXT REFERENCES workers(id),
  work_date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress IN (0, 25, 50, 75, 100)),
  status TEXT NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_signal_order_sku ON shortage_signals(order_id, sku_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_external ON rental_orders(external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hire_order_sku ON external_hires(order_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_lines_order ON rental_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_lines_sku ON rental_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON work_tasks(work_date);
CREATE INDEX IF NOT EXISTS idx_tasks_worker ON work_tasks(worker_id);

CREATE TABLE IF NOT EXISTS equipment_items (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'checked_out', 'needs_repair', 'in_repair')),
  location_id TEXT REFERENCES locations(id),
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  external_ref TEXT,
  order_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment_status_history (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES equipment_items(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment_items(status);
CREATE INDEX IF NOT EXISTS idx_equipment_sku ON equipment_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_equipment_external ON equipment_items(external_ref);
CREATE INDEX IF NOT EXISTS idx_equipment_history_item ON equipment_status_history(item_id);

CREATE TABLE IF NOT EXISTS product_families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  approved_at INTEGER NOT NULL,
  approved_by TEXT,
  revoked_at INTEGER,
  expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS kit_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  family_id TEXT REFERENCES product_families(id)
);

CREATE TABLE IF NOT EXISTS kit_subtypes (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES kit_groups(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  sku_id TEXT REFERENCES skus(id)
);

CREATE TABLE IF NOT EXISTS kit_units (
  id TEXT PRIMARY KEY,
  subtype_id TEXT NOT NULL REFERENCES kit_subtypes(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kit_checklist_items (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES kit_units(id),
  label TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kit_subtypes_group ON kit_subtypes(group_id);
CREATE INDEX IF NOT EXISTS idx_kit_units_subtype ON kit_units(subtype_id);
CREATE INDEX IF NOT EXISTS idx_kit_items_unit ON kit_checklist_items(unit_id);

CREATE TABLE IF NOT EXISTS order_accessories (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  sku_id TEXT REFERENCES skus(id),
  label TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  assembled INTEGER NOT NULL DEFAULT 0 CHECK (assembled IN (0, 1)),
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_accessories_order ON order_accessories(order_id);

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('access_request', 'shortage', 'check_in', 'transfer', 'order_phase')),
  chat_id TEXT,
  username TEXT,
  payload TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sent', 'mock', 'skipped')),
  created_at INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_created ON telegram_outbox(created_at);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty INTEGER NOT NULL CHECK (qty >= 1),
  from_location_id TEXT NOT NULL REFERENCES locations(id),
  to_location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL CHECK (status IN ('planned', 'in_transit', 'received', 'cancelled')),
  order_id TEXT REFERENCES rental_orders(id),
  driver_user_id TEXT REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  shipped_at INTEGER,
  received_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
`

function columnExists(db: Sql, table: string, column: string): boolean {
  const rows = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

function metaFlag(db: Sql, key: string): boolean {
  return Boolean(db.get<{ value: string }>(`SELECT value FROM ledger_meta WHERE key = ?`, [key]));
}

function setMetaFlag(db: Sql, key: string): void {
  db.run(`INSERT INTO ledger_meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'`, [key]);
}

/** Расширяет CHECK ролей (driver) без потери строк. */
function ensureUsersRoleDriver(db: Sql): void {
  if (metaFlag(db, "schema:users_role_driver")) return;
  try {
    db.run(`INSERT INTO users (id, name, role) VALUES ('__probe_driver__', 'probe', 'driver')`);
    db.run(`DELETE FROM users WHERE id = '__probe_driver__'`);
    setMetaFlag(db, "schema:users_role_driver");
    return;
  } catch {
    /* старый CHECK — пересоздаём таблицу */
  }
  db.exec(`PRAGMA foreign_keys=OFF`);
  db.exec(`
CREATE TABLE users__role_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('warehouse', 'logistics', 'manager', 'admin', 'driver')),
  email TEXT,
  phone TEXT,
  telegram_username TEXT,
  telegram_chat_id TEXT
);
INSERT INTO users__role_v2 (id, name, role, email, phone, telegram_username, telegram_chat_id)
  SELECT id, name, role, email, phone, telegram_username, telegram_chat_id FROM users;
DROP TABLE users;
ALTER TABLE users__role_v2 RENAME TO users;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL AND email != '';
`);
  db.exec(`PRAGMA foreign_keys=ON`);
  setMetaFlag(db, "schema:users_role_driver");
}

/** Расширяет CHECK kind в telegram_outbox (transfer, order_phase). */
function ensureTelegramOutboxKinds(db: Sql): void {
  if (metaFlag(db, "schema:telegram_outbox_kinds_v2")) return;
  try {
    const id = "__probe_tg_kind__";
    db.run(
      `INSERT INTO telegram_outbox (id, kind, chat_id, username, payload, mode, created_at, error)
       VALUES (?, 'transfer', NULL, NULL, 'probe', 'skipped', ?, NULL)`,
      [id, Date.now()],
    );
    db.run(`DELETE FROM telegram_outbox WHERE id = ?`, [id]);
    setMetaFlag(db, "schema:telegram_outbox_kinds_v2");
    return;
  } catch {
    /* старый CHECK — пересоздаём таблицу */
  }
  db.exec(`PRAGMA foreign_keys=OFF`);
  db.exec(`
CREATE TABLE telegram_outbox__v2 (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('access_request', 'shortage', 'check_in', 'transfer', 'order_phase')),
  chat_id TEXT,
  username TEXT,
  payload TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sent', 'mock', 'skipped')),
  created_at INTEGER NOT NULL,
  error TEXT
);
INSERT INTO telegram_outbox__v2 (id, kind, chat_id, username, payload, mode, created_at, error)
  SELECT id, kind, chat_id, username, payload, mode, created_at, error FROM telegram_outbox;
DROP TABLE telegram_outbox;
ALTER TABLE telegram_outbox__v2 RENAME TO telegram_outbox;
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_created ON telegram_outbox(created_at);
`);
  db.exec(`PRAGMA foreign_keys=ON`);
  setMetaFlag(db, "schema:telegram_outbox_kinds_v2");
}

/** Расширяет CHECK локаций (site = объект/площадка). */
function ensureLocationsSiteKind(db: Sql): void {
  if (metaFlag(db, "schema:locations_kind_site")) return;
  try {
    db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('__probe_site__', 'probe', 'site', NULL)`);
    db.run(`DELETE FROM locations WHERE id = '__probe_site__'`);
    setMetaFlag(db, "schema:locations_kind_site");
    return;
  } catch {
    /* старый CHECK */
  }
  db.exec(`PRAGMA foreign_keys=OFF`);
  db.exec(`
CREATE TABLE locations__kind_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warehouse', 'zone', 'bin', 'site')),
  parent_id TEXT
);
INSERT INTO locations__kind_v2 (id, name, kind, parent_id)
  SELECT id, name, kind, parent_id FROM locations;
DROP TABLE locations;
ALTER TABLE locations__kind_v2 RENAME TO locations;
`);
  db.exec(`PRAGMA foreign_keys=ON`);
  setMetaFlag(db, "schema:locations_kind_site");
}

function backfillSkuHierarchy(db: Sql): void {
  const skus = db.all<{ id: string; name: string; category: string; nameKey: string | null; familyId: string | null }>(
    `SELECT id, name, category, name_key AS nameKey, family_id AS familyId FROM skus`,
  );
  const familyByName = new Map<string, string>();
  for (const row of db.all<{ id: string; name: string }>(`SELECT id, name FROM product_families`)) {
    familyByName.set(row.name.trim().toLowerCase(), row.id);
  }
  let sort = 0;
  for (const sku of skus) {
    const nameKey = sku.nameKey?.trim() || normalizeEquipmentName(sku.name);
    let familyId = sku.familyId;
    const category = sku.category?.trim();
    if (!familyId && category && category.length >= 2) {
      const key = category.toLowerCase();
      let id = familyByName.get(key);
      if (!id) {
        id = `fam_${category.replace(/[^a-zA-Z0-9а-яА-Я]+/g, "_").slice(0, 40)}_${sort}`;
        const now = Date.now();
        try {
          db.run(`INSERT INTO product_families (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`, [
            id,
            category,
            sort,
            now,
          ]);
          familyByName.set(key, id);
          sort += 1;
        } catch {
          id = familyByName.get(key);
        }
      }
      familyId = id ?? null;
    }
    db.run(`UPDATE skus SET name_key = ?, family_id = COALESCE(family_id, ?), sort_order = COALESCE(sort_order, 0) WHERE id = ?`, [
      nameKey,
      familyId,
      sku.id,
    ]);
  }
}

export function migrate(db: Sql): void {
  db.exec(MIGRATION_SQL);
  if (!columnExists(db, "rental_orders", "source")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN source TEXT NOT NULL DEFAULT 'ui'`);
  }
  if (!columnExists(db, "rental_orders", "external_id")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN external_id TEXT`);
  }
  if (!columnExists(db, "rental_lines", "qty_issued")) {
    db.exec(`ALTER TABLE rental_lines ADD COLUMN qty_issued INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnExists(db, "skus", "family_id")) {
    db.exec(`ALTER TABLE skus ADD COLUMN family_id TEXT REFERENCES product_families(id)`);
  }
  if (!columnExists(db, "skus", "name_key")) {
    db.exec(`ALTER TABLE skus ADD COLUMN name_key TEXT`);
  }
  if (!columnExists(db, "skus", "sort_order")) {
    db.exec(`ALTER TABLE skus ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_skus_name_key ON skus(name_key) WHERE name_key IS NOT NULL AND name_key != ''`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_skus_family ON skus(family_id)`);
  if (!columnExists(db, "users", "email")) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  }
  if (!columnExists(db, "users", "phone")) {
    db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
  }
  if (!columnExists(db, "users", "telegram_username")) {
    db.exec(`ALTER TABLE users ADD COLUMN telegram_username TEXT`);
  }
  if (!columnExists(db, "users", "telegram_chat_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN telegram_chat_id TEXT`);
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL AND email != ''`,
  );
  // ledger_meta нужен для флагов схемы
  db.run(`INSERT INTO ledger_meta (key, value) VALUES ('revision', '0') ON CONFLICT(key) DO NOTHING`);
  ensureUsersRoleDriver(db);
  ensureLocationsSiteKind(db);
  if (!columnExists(db, "rental_orders", "mount_date")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN mount_date TEXT`);
  }
  if (!columnExists(db, "rental_orders", "show_start")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN show_start TEXT`);
  }
  if (!columnExists(db, "rental_orders", "show_end")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN show_end TEXT`);
  }
  if (!columnExists(db, "rental_orders", "demount_date")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN demount_date TEXT`);
  }
  if (!columnExists(db, "rental_orders", "phase")) {
    db.exec(`ALTER TABLE rental_orders ADD COLUMN phase TEXT NOT NULL DEFAULT 'planning'`);
  }
  db.exec(`
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  sku_id TEXT NOT NULL REFERENCES skus(id),
  qty INTEGER NOT NULL CHECK (qty >= 1),
  from_location_id TEXT NOT NULL REFERENCES locations(id),
  to_location_id TEXT NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL CHECK (status IN ('planned', 'in_transit', 'received', 'cancelled')),
  order_id TEXT REFERENCES rental_orders(id),
  driver_user_id TEXT REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  shipped_at INTEGER,
  received_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
`);
  db.exec(`
CREATE TABLE IF NOT EXISTS telegram_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('access_request', 'shortage', 'check_in', 'transfer', 'order_phase')),
  chat_id TEXT,
  username TEXT,
  payload TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('sent', 'mock', 'skipped')),
  created_at INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_created ON telegram_outbox(created_at);
`);
  ensureTelegramOutboxKinds(db);
  db.exec(`
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER
);
CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  approved_at INTEGER NOT NULL,
  approved_by TEXT,
  revoked_at INTEGER,
  expires_at INTEGER
);
`);
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_access_requests_pending_email
     ON access_requests(email) WHERE status = 'pending'`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_allowed_emails_active ON allowed_emails(email) WHERE revoked_at IS NULL`,
  );
  if (!columnExists(db, "allowed_emails", "expires_at")) {
    db.exec(`ALTER TABLE allowed_emails ADD COLUMN expires_at INTEGER`);
  }
  db.exec(`
CREATE TABLE IF NOT EXISTS kit_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kit_subtypes (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES kit_groups(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kit_units (
  id TEXT PRIMARY KEY,
  subtype_id TEXT NOT NULL REFERENCES kit_subtypes(id),
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kit_checklist_items (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES kit_units(id),
  label TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kit_subtypes_group ON kit_subtypes(group_id);
CREATE INDEX IF NOT EXISTS idx_kit_units_subtype ON kit_units(subtype_id);
CREATE INDEX IF NOT EXISTS idx_kit_items_unit ON kit_checklist_items(unit_id);
`);
  if (!columnExists(db, "kit_groups", "family_id")) {
    db.exec(`ALTER TABLE kit_groups ADD COLUMN family_id TEXT REFERENCES product_families(id)`);
  }
  if (!columnExists(db, "kit_subtypes", "sku_id")) {
    db.exec(`ALTER TABLE kit_subtypes ADD COLUMN sku_id TEXT REFERENCES skus(id)`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_groups_family ON kit_groups(family_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kit_subtypes_sku ON kit_subtypes(sku_id)`);
  db.exec(`
CREATE TABLE IF NOT EXISTS order_accessories (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rental_orders(id),
  sku_id TEXT REFERENCES skus(id),
  label TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1),
  assembled INTEGER NOT NULL DEFAULT 0 CHECK (assembled IN (0, 1)),
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_accessories_order ON order_accessories(order_id);
`);
  backfillSkuHierarchy(db);
  ensureDefaultRoleStockEdit(db);
  fixKitLeptopTypo(db);
  seedDefaultKitsIfEmpty(db);
  ensureKitsLinkedToCatalog(db);
  db.run(`INSERT INTO ledger_meta (key, value) VALUES ('revision', '0') ON CONFLICT(key) DO NOTHING`);
  db.run(`UPDATE users SET name = 'Дмитрий' WHERE id = 'user_manager' AND name = 'Мария'`);
  db.run(
    `UPDATE users SET email = 'alexey@led.local' WHERE id = 'user_warehouse' AND (email IS NULL OR email = '')`,
  );
  db.run(
    `UPDATE users SET email = 'dmitry@led.local' WHERE id = 'user_manager' AND (email IS NULL OR email = '')`,
  );
  // ledvision2026.il@gmail.com — в allowlist по умолчанию (revoke разрешён).
  // Permanent owner в таблицу не пишем: он hardcoded всегда allowed.
  const defaultAllow = "ledvision2026.il@gmail.com";
  const existingDefault = db.get<{ email: string; revoked_at: number | null }>(
    `SELECT email, revoked_at FROM allowed_emails WHERE email = ?`,
    [defaultAllow],
  );
  if (!existingDefault) {
    db.run(
      `INSERT INTO allowed_emails (email, approved_at, approved_by, revoked_at, expires_at) VALUES (?, ?, 'seed:default', NULL, NULL)`,
      [defaultAllow, Date.now()],
    );
  }
  // Временный доступ (не админ): nika123.z@mail.ru — 30 дней с момента первого migrate на устройстве.
  // Не продлеваем при повторном migrate; revoke разрешён.
  const tempEmail = "nika123.z@mail.ru";
  const existingTemp = db.get<{ email: string }>(`SELECT email FROM allowed_emails WHERE email = ?`, [tempEmail]);
  if (!existingTemp) {
    const now = Date.now();
    const dayMs = 86_400_000;
    db.run(
      `INSERT INTO allowed_emails (email, approved_at, approved_by, revoked_at, expires_at)
       VALUES (?, ?, 'seed:temp-30d', NULL, ?)`,
      [tempEmail, now, now + 30 * dayMs],
    );
  }
  // Peer slice: водитель + площадки на уже существующих демо-БД (когда seed уже был).
  // Не вставлять до seedIfEmpty — иначе COUNT(users)>0 и каталог не засеется.
  const hasDemoSeed = db.get<{ id: string }>(`SELECT id FROM users WHERE id = 'user_warehouse'`);
  if (hasDemoSeed) {
    if (!db.get<{ id: string }>(`SELECT id FROM users WHERE id = 'user_driver'`)) {
      db.run(`INSERT INTO users (id, name, role, email) VALUES ('user_driver', 'Игорь', 'driver', 'igor@led.local')`);
    }
    if (!db.get<{ id: string }>(`SELECT id FROM locations WHERE id = 'loc_site_embankment'`)) {
      db.run(
        `INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc_site_embankment', 'Площадка «Набережная»', 'site', NULL)`,
      );
    }
    if (!db.get<{ id: string }>(`SELECT id FROM locations WHERE id = 'loc_site_field'`)) {
      db.run(
        `INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc_site_field', 'Площадка «Поле»', 'site', NULL)`,
      );
    }
  }
}
