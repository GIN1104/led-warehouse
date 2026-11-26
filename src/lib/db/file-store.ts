import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { openBetterSqlite, type SqliteHandle } from "@/lib/db/better";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import type { Sql } from "@/lib/db/sql";
import { alignWithRemote, pushSnapshot, replayStatements, tursoEnabled, type SqlStmt } from "@/lib/db/turso";

const filePath = process.env.LEDGER_PATH ?? "data/warehouse.sqlite";

type Live = { handle: SqliteHandle; revision: number };

let live: Live | null = null;
let chain: Promise<unknown> = Promise.resolve();
let cloudReady = false;
let replaceNeedsPush = false;

function readRevision(db: Sql): number {
  const row = db.get<{ value: string }>(`SELECT value FROM ledger_meta WHERE key = 'revision'`);
  return Number(row?.value ?? "0");
}

function openLive(): Live {
  if (live) return live;
  mkdirSync(dirname(filePath), { recursive: true });
  const handle = openBetterSqlite(filePath);
  migrate(handle);
  if (!tursoEnabled()) seedIfEmpty(handle);
  live = { handle, revision: readRevision(handle) };
  return live;
}

function userCount(db: Sql): number {
  const row = db.get<{ value: number }>(`SELECT COUNT(*) AS value FROM users`);
  return Number(row?.value ?? 0);
}

/** Облако подключается один раз за процесс. Локальный файл остаётся рабочей копией. */
async function ensureCloud(): Promise<void> {
  if (!tursoEnabled() || cloudReady) return;
  try {
    const current = openLive();
    const direction = await alignWithRemote(current.handle, userCount(current.handle), readRevision(current.handle));
    if (direction === "pull") {
      // pullSnapshot затирает таблицы — после него снова migrate (backfill family_id / product_families).
      const familiesBefore = Number(
        current.handle.get<{ c: number }>(`SELECT COUNT(*) AS c FROM product_families`)?.c ?? 0,
      );
      migrate(current.handle);
      current.revision = readRevision(current.handle);
      const familiesAfter = Number(
        current.handle.get<{ c: number }>(`SELECT COUNT(*) AS c FROM product_families`)?.c ?? 0,
      );
      if (familiesAfter > familiesBefore) {
        current.revision += 1;
        current.handle.run(`UPDATE ledger_meta SET value = ? WHERE key = 'revision'`, [String(current.revision)]);
        try {
          await pushSnapshot(current.handle);
        } catch {
          /* локально исправлено; следующий успешный push догонит Turso */
        }
      }
    }
    if (userCount(current.handle) === 0) {
      seedIfEmpty(current.handle);
      if (userCount(current.handle) > 0) {
        try {
          await pushSnapshot(current.handle);
        } catch {
          /* local seed still usable */
        }
      }
    }
  } catch {
    // Turso unreachable/schema lag — serve /data/warehouse.sqlite for this process.
  }
  cloudReady = true;
}

/** Записи в журнал уходят в Turso после успешной локальной транзакции. */
function journaled(inner: Sql, journal: SqlStmt[]): Sql {
  return {
    exec(sql) {
      inner.exec(sql);
      journal.push({ sql, args: [] });
    },
    get(sql, params) {
      return inner.get(sql, params);
    },
    all(sql, params) {
      return inner.all(sql, params);
    },
    run(sql, params = []) {
      inner.run(sql, params);
      journal.push({ sql, args: params });
    },
    transaction(fn) {
      const mark = journal.length;
      try {
        return inner.transaction(fn);
      } catch (error) {
        journal.splice(mark);
        throw error;
      }
    },
  };
}

/** Одна очередь на процесс: браузер, mapper и рамка не перетирают файл одновременно. */
export function enqueueLedger<T>(fn: (db: Sql) => T): Promise<T> {
  const run = chain.then(async () => {
    await ensureCloud();
    const current = openLive();
    const journal: SqlStmt[] = [];
    replaceNeedsPush = false;
    const result = fn(journaled(current.handle, journal));
    // Fail-closed: успешный ответ API только если Turso принял снимок / journal.
    if (tursoEnabled() && replaceNeedsPush) {
      await pushSnapshot(openLive().handle);
    } else if (tursoEnabled() && journal.length > 0) {
      try {
        await replayStatements(journal);
      } catch {
        await pushSnapshot(current.handle);
      }
    }
    return result;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function bumpRevision(db: Sql): number {
  const current = openLive();
  current.revision += 1;
  db.run(`UPDATE ledger_meta SET value = ? WHERE key = 'revision'`, [String(current.revision)]);
  return current.revision;
}

export function currentRevision(): Promise<number> {
  return enqueueLedger(() => openLive().revision);
}

export function exportLedger(): Promise<{ revision: number; bytes: Uint8Array }> {
  return enqueueLedger(() => {
    const current = openLive();
    return { revision: current.revision, bytes: new Uint8Array(current.handle.serialize()) };
  });
}

function applyLedgerBytes(bytes: Uint8Array, nextRevision: number): number {
  const current = openLive();
  const tmp = `${filePath}.upload`;
  writeFileSync(tmp, bytes);
  const probe = openBetterSqlite(tmp);
  try {
    migrate(probe);
    probe.run(
      `INSERT INTO ledger_meta (key, value) VALUES ('revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(nextRevision)],
    );
  } catch (error) {
    probe.close();
    throw error;
  }
  probe.close();
  current.handle.close();
  live = null;
  renameSync(tmp, filePath);
  const reopened = openLive();
  reopened.revision = readRevision(reopened.handle);
  replaceNeedsPush = true;
  return reopened.revision;
}

export function replaceLedger(
  baseRevision: number,
  bytes: Uint8Array,
): Promise<{ ok: true; revision: number } | { ok: false; revision: number }> {
  return enqueueLedger(() => {
    const current = openLive();
    if (baseRevision !== current.revision) return { ok: false as const, revision: current.revision };
    const revision = applyLedgerBytes(bytes, current.revision + 1);
    return { ok: true as const, revision };
  });
}

/**
 * Восстановление из dump: всегда заменяет локальный ledger, bump revision, затем push в Turso.
 * Опасная операция — только owner API.
 */
export function forceReplaceLedger(bytes: Uint8Array): Promise<{ revision: number }> {
  return enqueueLedger(() => {
    const current = openLive();
    const revision = applyLedgerBytes(bytes, current.revision + 1);
    return { revision };
  });
}
