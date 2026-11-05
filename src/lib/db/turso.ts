import { createClient, type Client, type InStatement, type InValue, type ResultSet } from "@libsql/client";
import { MIGRATION_SQL } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";

/** Родители раньше детей, чтобы внешние ключи проходили при полной замене. */
const INSERT_ORDER = [
  "users",
  "locations",
  "product_families",
  "skus",
  "equipment_items",
  "equipment_status_history",
  "rental_orders",
  "stock_balances",
  "stock_movements",
  "scan_events",
  "rental_lines",
  "order_accessories",
  "shortage_signals",
  "external_hires",
  "alerts",
  "workers",
  "work_tasks",
  "ledger_meta",
  "audit_log",
  "kit_groups",
  "kit_subtypes",
  "kit_units",
  "kit_checklist_items",
  "access_requests",
  "allowed_emails",
  "telegram_outbox",
  "stock_transfers",
] as const;

export type SqlStmt = { sql: string; args: unknown[] };

let client: Client | null = null;

/**
 * Turso/libSQL remote. Real cloud needs URL + token.
 * Local mock without secrets: `TURSO_DATABASE_URL=file:…/mock.db` (token optional).
 */
export function tursoConfig(): { url: string; authToken?: string } | null {
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!url) return null;
  if (url.startsWith("file:")) return authToken ? { url, authToken } : { url };
  if (!authToken) return null;
  return { url, authToken };
}

export function tursoEnabled(): boolean {
  return tursoConfig() !== null;
}

function remote(): Client {
  const cfg = tursoConfig();
  if (!cfg) throw new Error("Turso не настроен");
  if (!client) client = createClient(cfg);
  return client;
}

function asInValue(value: unknown): InValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Uint8Array || value instanceof Date) return value;
  return String(value);
}

function rowsOf(result: ResultSet): Record<string, unknown>[] {
  return result.rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (const column of result.columns) record[column] = row[column] ?? null;
    return record;
  });
}

function locationRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const pending = [...rows];
  const ordered: Record<string, unknown>[] = [];
  const placed = new Set<unknown>();
  while (pending.length > 0) {
    const next = pending.findIndex((row) => row.parent_id == null || placed.has(row.parent_id));
    if (next < 0) {
      ordered.push(...pending);
      break;
    }
    const [row] = pending.splice(next, 1);
    ordered.push(row!);
    placed.add(row!.id);
  }
  return ordered;
}

function insertStmts(table: string, rows: Record<string, unknown>[]): { sql: string; args: InValue[] }[] {
  const ordered = table === "locations" ? locationRows(rows) : rows;
  return ordered.map((row) => {
    const keys = Object.keys(row);
    return {
      sql: `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
      args: keys.map((key) => asInValue(row[key])),
    };
  });
}

async function runBatches(target: Client, statements: InStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await target.batch(statements, "write");
}

function clearStatements(): InStatement[] {
  const statements: InStatement[] = [];
  for (const table of [...INSERT_ORDER].reverse()) {
    if (table === "locations") statements.push({ sql: "UPDATE locations SET parent_id = NULL" });
    statements.push({ sql: `DELETE FROM ${table}` });
  }
  return statements;
}

/** Columns added after first Turso create — CREATE IF NOT EXISTS won't alter old tables. */
const REMOTE_ALTERS = [
  "ALTER TABLE users ADD COLUMN email TEXT",
  "ALTER TABLE users ADD COLUMN phone TEXT",
  "ALTER TABLE users ADD COLUMN telegram_username TEXT",
  "ALTER TABLE users ADD COLUMN telegram_chat_id TEXT",
  "ALTER TABLE rental_orders ADD COLUMN source TEXT NOT NULL DEFAULT 'ui'",
  "ALTER TABLE rental_orders ADD COLUMN external_id TEXT",
  "ALTER TABLE rental_orders ADD COLUMN mount_date TEXT",
  "ALTER TABLE rental_orders ADD COLUMN show_start TEXT",
  "ALTER TABLE rental_orders ADD COLUMN show_end TEXT",
  "ALTER TABLE rental_orders ADD COLUMN demount_date TEXT",
  "ALTER TABLE rental_orders ADD COLUMN phase TEXT NOT NULL DEFAULT 'planning'",
  "ALTER TABLE rental_lines ADD COLUMN qty_issued INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE skus ADD COLUMN family_id TEXT",
  "ALTER TABLE skus ADD COLUMN name_key TEXT",
  "ALTER TABLE skus ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
];

async function ensureRemoteAlters(target: Client): Promise<void> {
  for (const sql of REMOTE_ALTERS) {
    try {
      await target.execute(sql);
    } catch {
      // column already exists / unsupported — keep going
    }
  }
}

async function rebuildUsersForDriverRole(target: Client): Promise<void> {
  const flag = await target.execute(`SELECT value FROM ledger_meta WHERE key = 'schema:users_role_driver'`);
  if (flag.rows[0]?.value) return;
  try {
    await target.execute({
      sql: `INSERT INTO users (id, name, role) VALUES (?, ?, ?)`,
      args: ["__probe_driver__", "probe", "driver"],
    });
    await target.execute({ sql: `DELETE FROM users WHERE id = ?`, args: ["__probe_driver__"] });
    await target.execute(
      `INSERT INTO ledger_meta (key, value) VALUES ('schema:users_role_driver', '1') ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
    return;
  } catch {
    /* old CHECK without driver */
  }
  try {
    await target.execute("PRAGMA foreign_keys = OFF");
  } catch {
    /* ignore */
  }
  await target.executeMultiple(`
CREATE TABLE IF NOT EXISTS users__role_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('warehouse', 'logistics', 'manager', 'admin', 'driver')),
  email TEXT,
  phone TEXT,
  telegram_username TEXT,
  telegram_chat_id TEXT
);
DELETE FROM users__role_v2;
INSERT INTO users__role_v2 (id, name, role, email, phone, telegram_username, telegram_chat_id)
  SELECT id, name, role, email, phone, telegram_username, telegram_chat_id FROM users;
DROP TABLE users;
ALTER TABLE users__role_v2 RENAME TO users;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users(email) WHERE email IS NOT NULL AND email != '';
INSERT INTO ledger_meta (key, value) VALUES ('schema:users_role_driver', '1') ON CONFLICT(key) DO UPDATE SET value = '1';
`);
  try {
    await target.execute("PRAGMA foreign_keys = ON");
  } catch {
    /* ignore */
  }
}

async function rebuildLocationsForSiteKind(target: Client): Promise<void> {
  const flag = await target.execute(`SELECT value FROM ledger_meta WHERE key = 'schema:locations_kind_site'`);
  if (flag.rows[0]?.value) return;
  try {
    await target.execute({
      sql: `INSERT INTO locations (id, name, kind, parent_id) VALUES (?, ?, ?, NULL)`,
      args: ["__probe_site__", "probe", "site"],
    });
    await target.execute({ sql: `DELETE FROM locations WHERE id = ?`, args: ["__probe_site__"] });
    await target.execute(
      `INSERT INTO ledger_meta (key, value) VALUES ('schema:locations_kind_site', '1') ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
    return;
  } catch {
    /* old CHECK */
  }
  try {
    await target.execute("PRAGMA foreign_keys = OFF");
  } catch {
    /* ignore */
  }
  await target.executeMultiple(`
CREATE TABLE IF NOT EXISTS locations__kind_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warehouse', 'zone', 'bin', 'site')),
  parent_id TEXT
);
DELETE FROM locations__kind_v2;
INSERT INTO locations__kind_v2 (id, name, kind, parent_id)
  SELECT id, name, kind, parent_id FROM locations;
DROP TABLE locations;
ALTER TABLE locations__kind_v2 RENAME TO locations;
INSERT INTO ledger_meta (key, value) VALUES ('schema:locations_kind_site', '1') ON CONFLICT(key) DO UPDATE SET value = '1';
`);
  try {
    await target.execute("PRAGMA foreign_keys = ON");
  } catch {
    /* ignore */
  }
}

export async function migrateRemote(target: Client = remote()): Promise<void> {
  await target.executeMultiple(MIGRATION_SQL);
  await ensureRemoteAlters(target);
  await target.execute(
    `INSERT INTO ledger_meta (key, value) VALUES ('revision', '0') ON CONFLICT(key) DO NOTHING`,
  );
  try {
    await rebuildUsersForDriverRole(target);
  } catch {
    /* keep serving local if remote schema rebuild fails */
  }
  try {
    await rebuildLocationsForSiteKind(target);
  } catch {
    /* same */
  }
}

export async function remoteRevision(target: Client = remote()): Promise<number> {
  const result = await target.execute(`SELECT value FROM ledger_meta WHERE key = 'revision'`);
  const value = result.rows[0]?.value;
  return Number(value ?? "0");
}

export async function remoteUserCount(target: Client = remote()): Promise<number> {
  const result = await target.execute(`SELECT COUNT(*) AS value FROM users`);
  return Number(result.rows[0]?.value ?? 0);
}

/** Полная копия локального файла в Turso. Удалённая база становится такой же. */
export async function pushSnapshot(db: Sql, target: Client = remote()): Promise<void> {
  const statements = clearStatements();
  for (const table of INSERT_ORDER) {
    const rows = db.all<Record<string, unknown>>(`SELECT * FROM ${table}`);
    statements.push(...insertStmts(table, rows));
  }
  await runBatches(target, statements);
}

/** Полная копия Turso в открытый локальный файл. */
export async function pullSnapshot(db: Sql, target: Client = remote()): Promise<void> {
  const tables = new Map<string, Record<string, unknown>[]>();
  for (const table of INSERT_ORDER) {
    const result = await target.execute(`SELECT * FROM ${table}`);
    tables.set(table, rowsOf(result));
  }
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.transaction(() => {
      for (const table of [...INSERT_ORDER].reverse()) {
        if (table === "locations") db.run(`UPDATE locations SET parent_id = NULL`);
        db.run(`DELETE FROM ${table}`);
      }
      for (const table of INSERT_ORDER) {
        for (const statement of insertStmts(table, tables.get(table) ?? [])) {
          db.run(statement.sql, (statement.args ?? []) as unknown[]);
        }
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

/** Повтор тех же записей, что уже прошли в локальный файл. */
export async function replayStatements(statements: SqlStmt[], target: Client = remote()): Promise<void> {
  if (statements.length === 0) return;
  await runBatches(
    target,
    statements.map((statement) => ({ sql: statement.sql, args: statement.args.map(asInValue) })),
  );
}

/**
 * Если в облаке новее — забираем его. Если локальный файл новее или облако пустое — отправляем файл.
 * Возвращает, откуда взяли данные.
 */
export async function alignWithRemote(db: Sql, localUsers: number, localRevision: number): Promise<"pull" | "push" | "same"> {
  const target = remote();
  await migrateRemote(target);
  const users = await remoteUserCount(target);
  const revision = await remoteRevision(target);
  if (users > 0 && (localUsers === 0 || revision > localRevision)) {
    try {
      await pullSnapshot(db, target);
      return "pull";
    } catch {
      return "same";
    }
  }
  if (localUsers > 0 && (users === 0 || localRevision > revision)) {
    try {
      await pushSnapshot(db, target);
      return "push";
    } catch {
      return "same";
    }
  }
  return "same";
}
