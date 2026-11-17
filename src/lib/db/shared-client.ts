import { apiUrl } from "@/lib/api";
import { exportSqlBytes, openSqlFromBytes } from "@/lib/db/browser";
import { loadLedgerSnapshot, saveLedgerSnapshot } from "@/lib/db/ledger-snapshot";
import type { Sql } from "@/lib/db/sql";

const FETCH_TIMEOUT_MS = 12_000;

let revision = 0;

export function knownRevision(): number {
  return revision;
}

export function setKnownRevision(value: number): void {
  revision = value;
}

export class LedgerNetworkError extends Error {
  constructor(message = "Нет связи с сервером учёта") {
    super(message);
    this.name = "LedgerNetworkError";
  }
}

export class LedgerOfflineWriteError extends Error {
  constructor(message = "Нет связи с сервером — запись отключена") {
    super(message);
    this.name = "LedgerOfflineWriteError";
  }
}

export type OpenSharedResult = {
  db: Sql;
  revision: number;
  source: "network" | "snapshot";
  snapshotSavedAt: string | null;
};

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new LedgerNetworkError("Таймаут запроса к серверу учёта");
    }
    throw new LedgerNetworkError(error instanceof Error ? error.message : "Failed to fetch");
  } finally {
    clearTimeout(timer);
  }
}

async function persistFromLiveBytes(bytes: Uint8Array, nextRevision: number): Promise<string> {
  const savedAt = new Date().toISOString();
  try {
    await saveLedgerSnapshot({ revision: nextRevision, savedAt, bytes });
  } catch {
    // Снимок — best effort; живой ответ уже есть.
  }
  return savedAt;
}

/** Только сеть: без fallback. Кидает LedgerNetworkError при сбое. */
export async function openSharedDb(): Promise<Sql> {
  const result = await openSharedDbFromNetwork();
  return result.db;
}

export async function openSharedDbFromNetwork(): Promise<OpenSharedResult> {
  const response = await fetchWithTimeout(apiUrl("/api/v1/ledger"), { cache: "no-store" });
  if (!response.ok) {
    throw new LedgerNetworkError(`Сервер учёта ответил ${response.status}`);
  }
  revision = Number(response.headers.get("X-Revision") ?? "0");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const savedAt = await persistFromLiveBytes(bytes, revision);
  const db = await openSqlFromBytes(bytes);
  return { db, revision, source: "network", snapshotSavedAt: savedAt };
}

/** Сеть → при ошибке last-known snapshot; без снимка пробрасывает ошибку. */
export async function openSharedDbPreferSnapshot(): Promise<OpenSharedResult> {
  try {
    return await openSharedDbFromNetwork();
  } catch (error) {
    const snap = await loadLedgerSnapshot().catch(() => null);
    if (!snap) throw error;
    revision = snap.revision;
    const db = await openSqlFromBytes(snap.bytes);
    return { db, revision, source: "snapshot", snapshotSavedAt: snap.savedAt };
  }
}

/** Перечитать только snapshot (откат локальных правок в offline). */
export async function reopenFromSnapshot(): Promise<OpenSharedResult | null> {
  const snap = await loadLedgerSnapshot().catch(() => null);
  if (!snap) return null;
  revision = snap.revision;
  const db = await openSqlFromBytes(snap.bytes);
  return { db, revision, source: "snapshot", snapshotSavedAt: snap.savedAt };
}

export async function pushSharedDb(): Promise<"ok" | "conflict"> {
  let response: Response;
  try {
    response = await fetchWithTimeout(apiUrl("/api/v1/ledger"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Base-Revision": String(revision),
      },
      body: exportSqlBytes().slice(),
    });
  } catch (error) {
    if (error instanceof LedgerNetworkError) throw error;
    throw new LedgerNetworkError(error instanceof Error ? error.message : "Failed to fetch");
  }
  if (response.status === 409) return "conflict";
  if (!response.ok) throw new LedgerNetworkError(`Сервер учёта ответил ${response.status}`);
  revision = Number(response.headers.get("X-Revision") ?? String(revision + 1));
  try {
    await saveLedgerSnapshot({
      revision,
      savedAt: new Date().toISOString(),
      bytes: exportSqlBytes(),
    });
  } catch {
    // ignore
  }
  return "ok";
}

export type RevisionProbe = { ok: true; revision: number } | { ok: false };

/** Мягкий probe: сеть/CORS/5xx/таймаут → ok:false, без throw. */
export async function probeRemoteRevision(): Promise<RevisionProbe> {
  try {
    const response = await fetchWithTimeout(apiUrl("/api/v1/ledger/revision"), { cache: "no-store" });
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { revision: number };
    return { ok: true, revision: Number(body.revision) };
  } catch {
    return { ok: false };
  }
}

export async function remoteRevision(): Promise<number> {
  const probe = await probeRemoteRevision();
  return probe.ok ? probe.revision : revision;
}
