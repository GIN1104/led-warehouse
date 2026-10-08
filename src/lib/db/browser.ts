import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import type { Sql } from "@/lib/db/sql";
import { wrapSqlJs } from "@/lib/db/sqljs";

const DB_NAME = "led-warehouse";
const STORE = "kv";
const KEY = "sqlite";

let raw: SqlJsDatabase | null = null;

function readSaved(): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(STORE, "readonly");
      const get = tx.objectStore(STORE).get(KEY);
      get.onsuccess = () => resolve((get.result as Uint8Array | undefined) ?? null);
      get.onerror = () => reject(get.error);
    };
  });
}

export function persistBrowserDb(): Promise<void> {
  if (!raw) return Promise.resolve();
  const bytes = raw.export();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(bytes, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function loadSqlJs() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return initSqlJs({ locateFile: () => `${base}/sql-wasm.wasm` });
}

export function exportSqlBytes(): Uint8Array {
  if (!raw) throw new Error("База не открыта");
  return raw.export();
}

/** Снимок общего учёта: схема обновляется, демо-наполнение уже сделал сервер. */
export async function openSqlFromBytes(bytes: Uint8Array): Promise<Sql> {
  const SQL = await loadSqlJs();
  raw?.close();
  raw = bytes.byteLength > 0 ? new SQL.Database(bytes) : new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON");
  const db = wrapSqlJs(raw);
  migrate(db);
  return db;
}

/** База Pages живёт в IndexedDB этого браузера и не уходит на сервер. */
export async function openBrowserDb(): Promise<Sql> {
  const SQL = await loadSqlJs();
  const saved = await readSaved();
  raw?.close();
  raw = saved ? new SQL.Database(saved) : new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON");
  const db = wrapSqlJs(raw);
  migrate(db);
  seedIfEmpty(db);
  await persistBrowserDb();
  return db;
}
