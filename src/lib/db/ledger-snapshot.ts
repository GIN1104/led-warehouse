/**
 * Last-known shared ledger: IndexedDB bytes + localStorage meta (revision / savedAt).
 * Нужен Pages SPA, когда ACCESS_API_BASE / Fly / Turso недоступны.
 */

const DB_NAME = "led-warehouse";
const STORE = "kv";
const SNAPSHOT_KEY = "shared-ledger";
const META_KEY = "led-warehouse:shared-snapshot-meta";

export type LedgerSnapshotMeta = {
  revision: number;
  savedAt: string;
};

export type LedgerSnapshot = LedgerSnapshotMeta & {
  bytes: Uint8Array;
};

function openKv(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

export function readSnapshotMeta(): LedgerSnapshotMeta | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LedgerSnapshotMeta>;
    if (typeof parsed.revision !== "number" || typeof parsed.savedAt !== "string") return null;
    return { revision: parsed.revision, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeSnapshotMeta(meta: LedgerSnapshotMeta): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Приватный режим / квота — meta необязательна, bytes всё равно в IDB.
  }
}

export async function saveLedgerSnapshot(snapshot: LedgerSnapshot): Promise<void> {
  const meta: LedgerSnapshotMeta = { revision: snapshot.revision, savedAt: snapshot.savedAt };
  writeSnapshotMeta(meta);
  if (typeof indexedDB === "undefined") return;
  const db = await openKv();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(
        { revision: snapshot.revision, savedAt: snapshot.savedAt, bytes: snapshot.bytes },
        SNAPSHOT_KEY,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("snapshot put failed"));
    });
  } finally {
    db.close();
  }
}

export async function loadLedgerSnapshot(): Promise<LedgerSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openKv();
  try {
    const row = await new Promise<{ revision?: number; savedAt?: string; bytes?: Uint8Array } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const get = tx.objectStore(STORE).get(SNAPSHOT_KEY);
        get.onsuccess = () => resolve(get.result as { revision?: number; savedAt?: string; bytes?: Uint8Array } | undefined);
        get.onerror = () => reject(get.error ?? new Error("snapshot get failed"));
      },
    );
    if (!row?.bytes || !(row.bytes instanceof Uint8Array) || row.bytes.byteLength === 0) return null;
    const meta = readSnapshotMeta();
    const revision = typeof row.revision === "number" ? row.revision : (meta?.revision ?? 0);
    const savedAt = typeof row.savedAt === "string" ? row.savedAt : (meta?.savedAt ?? new Date(0).toISOString());
    return { revision, savedAt, bytes: row.bytes };
  } finally {
    db.close();
  }
}

/** Человекочитаемая дата снимка для баннера (локаль браузера). */
export function formatSnapshotWhen(savedAt: string, lang: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  try {
    return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : lang === "en" ? "en-GB" : "ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return savedAt;
  }
}
