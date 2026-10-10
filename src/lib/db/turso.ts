import { createClient, type Client, type InStatement, type InValue, type ResultSet } from "@libsql/client";
import { MIGRATION_SQL } from "@/lib/db/migrate";
import type { Sql } from "@/lib/db/sql";

/** Родители раньше детей, чтобы внешние ключи проходили при полной замене. */
const INSERT_ORDER = [
  "users",
  "locations",
  "skus",
  "rental_orders",
  "stock_balances",
  "stock_movements",
  "scan_events",
  "rental_lines",
  "shortage_signals",
  "external_hires",
  "alerts",
  "workers",
  "work_tasks",
  "ledger_meta",
  "audit_log",
] as const;

export type SqlStmt = { sql: string; args: unknown[] };

let client: Client | null = null;

export function tursoConfig(): { url: string; authToken: string } | null {
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!url || !authToken) return null;
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

export async function migrateRemote(target: Client = remote()): Promise<void> {
  await target.executeMultiple(MIGRATION_SQL);
  await target.execute(
    `INSERT INTO ledger_meta (key, value) VALUES ('revision', '0') ON CONFLICT(key) DO NOTHING`,
  );
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
    await pullSnapshot(db, target);
    return "pull";
  }
  if (localUsers > 0 && (users === 0 || localRevision > revision)) {
    await pushSnapshot(db, target);
    return "push";
  }
  return "same";
}
