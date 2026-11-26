import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  allowBackupMock,
  assertDriveBackupConfigured,
  getDriveBackupConfig,
  hasDriveBackupConfig,
} from "@/lib/backup/config";
import { driveDeleteFile, driveDownloadFile, driveListBackupFiles, driveUploadFile } from "@/lib/backup/drive-client";
import { backupDumpFileName, isBackupDumpName } from "@/lib/backup/naming";
import { keysToDeleteForRetention } from "@/lib/backup/retention";

export type BackupEntry = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  mode: "live" | "mock";
};

const mockRoot = () =>
  join(process.env.LEDGER_PATH ? join(process.env.LEDGER_PATH, "..") : "data", "backups-mock");

function mockDir(): string {
  const dir = join(mockRoot(), "drive");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function listMock(): BackupEntry[] {
  const dir = mockDir();
  return readdirSync(dir)
    .filter((name) => isBackupDumpName(name) || name.endsWith(".dump"))
    .map((name) => {
      const st = statSync(join(dir, name));
      return {
        key: name,
        name,
        size: st.size,
        lastModified: st.mtime.toISOString(),
        mode: "mock" as const,
      };
    })
    .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
}

function writeMock(name: string, bytes: Uint8Array): BackupEntry {
  const path = join(mockDir(), name);
  writeFileSync(path, bytes);
  return {
    key: name,
    name,
    size: bytes.byteLength,
    lastModified: new Date().toISOString(),
    mode: "mock",
  };
}

function readMock(key: string): Uint8Array {
  return new Uint8Array(readFileSync(join(mockDir(), key)));
}

function deleteMock(key: string): void {
  try {
    unlinkSync(join(mockDir(), key));
  } catch {
    /* ignore */
  }
}

export function driveBackupStatus(env: Record<string, string | undefined> = process.env): {
  configured: boolean;
  mode: "live" | "mock";
} {
  const configured = hasDriveBackupConfig(env);
  return { configured, mode: configured ? "live" : "mock" };
}

/** @deprecated use driveBackupStatus — оставлен для совместимости health. */
export function targetStatus(env: Record<string, string | undefined> = process.env) {
  return { drive: driveBackupStatus(env) };
}

export async function listBackups(): Promise<BackupEntry[]> {
  const cfg = getDriveBackupConfig();
  if (!cfg) {
    // Shared host без secrets: пустой список + badge mock в UI (create/restore упадут).
    if (!allowBackupMock()) return [];
    return listMock();
  }
  const files = await driveListBackupFiles(cfg);
  return files
    .filter((file) => isBackupDumpName(file.name))
    .map((file) => ({
      key: file.id,
      name: file.name,
      size: file.size,
      lastModified: file.modifiedTime?.toISOString() ?? null,
      mode: "live" as const,
    }));
}

async function prune(entries: BackupEntry[]): Promise<string[]> {
  const doomed = keysToDeleteForRetention(
    entries.map((e) => ({
      key: e.key,
      name: e.name,
      lastModified: e.lastModified ? new Date(e.lastModified) : null,
    })),
  );
  const cfg = getDriveBackupConfig();
  for (const key of doomed) {
    if (cfg) await driveDeleteFile(cfg, key);
    else deleteMock(key);
  }
  return doomed;
}

export type UploadResult = {
  entry: BackupEntry;
  pruned: string[];
  mode: "live" | "mock";
};

export async function uploadBackup(bytes: Uint8Array, opts?: { fileName?: string }): Promise<UploadResult> {
  assertDriveBackupConfigured();
  const name = opts?.fileName ?? backupDumpFileName();
  const cfg = getDriveBackupConfig();
  if (!cfg) {
    const entry = writeMock(name, bytes);
    const pruned = await prune(await listBackups());
    return { entry, pruned, mode: "mock" };
  }
  const uploaded = await driveUploadFile(cfg, name, bytes);
  const entry: BackupEntry = {
    key: uploaded.id,
    name: uploaded.name,
    size: uploaded.size,
    lastModified: uploaded.modifiedTime?.toISOString() ?? new Date().toISOString(),
    mode: "live",
  };
  const pruned = await prune(await listBackups());
  return { entry, pruned, mode: "live" };
}

export async function downloadBackup(key: string): Promise<{ bytes: Uint8Array; name: string }> {
  assertDriveBackupConfigured();
  const cfg = getDriveBackupConfig();
  if (!cfg) {
    const bytes = readMock(key);
    return { bytes, name: key };
  }
  const listed = await listBackups();
  const meta = listed.find((row) => row.key === key);
  const bytes = await driveDownloadFile(cfg, key);
  return { bytes, name: meta?.name ?? key };
}
