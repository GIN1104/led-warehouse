import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { openBetterSqlite, type SqliteHandle } from "@/lib/db/better";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import type { Sql } from "@/lib/db/sql";

const filePath = process.env.LEDGER_PATH ?? "data/warehouse.sqlite";

type Live = { handle: SqliteHandle; revision: number };

let live: Live | null = null;
let chain: Promise<unknown> = Promise.resolve();

function readRevision(db: Sql): number {
  const row = db.get<{ value: string }>(`SELECT value FROM ledger_meta WHERE key = 'revision'`);
  return Number(row?.value ?? "0");
}

function openLive(): Live {
  if (live) return live;
  mkdirSync(dirname(filePath), { recursive: true });
  const handle = openBetterSqlite(filePath);
  migrate(handle);
  seedIfEmpty(handle);
  live = { handle, revision: readRevision(handle) };
  return live;
}

/** Одна очередь на процесс: браузер, mapper и рамка не перетирают файл одновременно. */
export function enqueueLedger<T>(fn: (db: Sql) => T): Promise<T> {
  const run = chain.then(() => fn(openLive().handle));
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

export function replaceLedger(
  baseRevision: number,
  bytes: Uint8Array,
): Promise<{ ok: true; revision: number } | { ok: false; revision: number }> {
  return enqueueLedger(() => {
    const current = openLive();
    if (baseRevision !== current.revision) return { ok: false as const, revision: current.revision };
    const tmp = `${filePath}.upload`;
    writeFileSync(tmp, bytes);
    const probe = openBetterSqlite(tmp);
    const next = current.revision + 1;
    try {
      migrate(probe);
      probe.run(
        `INSERT INTO ledger_meta (key, value) VALUES ('revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(next)],
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
    return { ok: true as const, revision: reopened.revision };
  });
}
