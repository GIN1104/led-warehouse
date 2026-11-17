import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getDriveBackupConfig,
  getR2Config,
  hasDriveBackupConfig,
  hasR2Config,
  type BackupTarget,
} from "@/lib/backup/config";
import { driveDeleteFile, driveDownloadFile, driveListBackupFiles, driveUploadFile } from "@/lib/backup/drive-client";
import { backupDumpFileName, isBackupDumpName } from "@/lib/backup/naming";
import { keysToDeleteForRetention } from "@/lib/backup/retention";
import { r2DeleteObject, r2GetObject, r2ListObjects, r2PutObject } from "@/lib/backup/r2-client";

export type BackupEntry = {
  target: BackupTarget;
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
  mode: "live" | "mock";
};

const mockRoot = () => join(process.env.LEDGER_PATH ? join(process.env.LEDGER_PATH, "..") : "data", "backups-mock");

function mockDir(target: BackupTarget): string {
  const dir = join(mockRoot(), target);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function listMock(target: BackupTarget): BackupEntry[] {
  const dir = mockDir(target);
  return readdirSync(dir)
    .filter((name) => isBackupDumpName(name) || name.endsWith(".dump"))
    .map((name) => {
      const st = statSync(join(dir, name));
      return {
        target,
        key: name,
        name,
        size: st.size,
        lastModified: st.mtime.toISOString(),
        mode: "mock" as const,
      };
    })
    .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
}

function writeMock(target: BackupTarget, name: string, bytes: Uint8Array): BackupEntry {
  const path = join(mockDir(target), name);
  writeFileSync(path, bytes);
  return {
    target,
    key: name,
    name,
    size: bytes.byteLength,
    lastModified: new Date().toISOString(),
    mode: "mock",
  };
}

function readMock(target: BackupTarget, key: string): Uint8Array {
  return new Uint8Array(readFileSync(join(mockDir(target), key)));
}

function deleteMock(target: BackupTarget, key: string): void {
  try {
    unlinkSync(join(mockDir(target), key));
  } catch {
    /* ignore */
  }
}

export function targetStatus(env: Record<string, string | undefined> = process.env): {
  r2: { configured: boolean; mode: "live" | "mock" };
  drive: { configured: boolean; mode: "live" | "mock" };
} {
  return {
    r2: { configured: hasR2Config(env), mode: hasR2Config(env) ? "live" : "mock" },
    drive: { configured: hasDriveBackupConfig(env), mode: hasDriveBackupConfig(env) ? "live" : "mock" },
  };
}

async function listR2(): Promise<BackupEntry[]> {
  const cfg = getR2Config();
  if (!cfg) return listMock("r2");
  const objects = await r2ListObjects(cfg);
  return objects
    .filter((obj) => isBackupDumpName(obj.key.split("/").pop() ?? obj.key))
    .map((obj) => ({
      target: "r2" as const,
      key: obj.key,
      name: obj.key.split("/").pop() ?? obj.key,
      size: obj.size,
      lastModified: obj.lastModified?.toISOString() ?? null,
      mode: "live" as const,
    }))
    .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
}

async function listDrive(): Promise<BackupEntry[]> {
  const cfg = getDriveBackupConfig();
  if (!cfg) return listMock("drive");
  const files = await driveListBackupFiles(cfg);
  return files
    .filter((file) => isBackupDumpName(file.name))
    .map((file) => ({
      target: "drive" as const,
      key: file.id,
      name: file.name,
      size: file.size,
      lastModified: file.modifiedTime?.toISOString() ?? null,
      mode: "live" as const,
    }));
}

export async function listBackups(target?: BackupTarget | "all"): Promise<BackupEntry[]> {
  if (target === "r2") return listR2();
  if (target === "drive") return listDrive();
  const [r2, drive] = await Promise.all([listR2(), listDrive()]);
  return [...r2, ...drive].sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
}

async function pruneTarget(target: BackupTarget, entries: BackupEntry[]): Promise<string[]> {
  const doomed = keysToDeleteForRetention(
    entries.map((e) => ({
      key: e.key,
      name: e.name,
      lastModified: e.lastModified ? new Date(e.lastModified) : null,
    })),
  );
  for (const key of doomed) {
    if (target === "r2") {
      const cfg = getR2Config();
      if (cfg) await r2DeleteObject(cfg, key);
      else deleteMock("r2", key);
    } else {
      const cfg = getDriveBackupConfig();
      if (cfg) await driveDeleteFile(cfg, key);
      else deleteMock("drive", key);
    }
  }
  return doomed;
}

export type UploadResult = {
  target: BackupTarget;
  entry: BackupEntry;
  pruned: string[];
  mode: "live" | "mock";
};

export async function uploadBackupToTarget(
  target: BackupTarget,
  bytes: Uint8Array,
  opts?: { fileName?: string },
): Promise<UploadResult> {
  const name = opts?.fileName ?? backupDumpFileName();
  if (target === "r2") {
    const cfg = getR2Config();
    if (!cfg) {
      const entry = writeMock("r2", name, bytes);
      const pruned = await pruneTarget("r2", await listR2());
      return { target, entry, pruned, mode: "mock" };
    }
    await r2PutObject(cfg, name, bytes);
    const entry: BackupEntry = {
      target: "r2",
      key: name,
      name,
      size: bytes.byteLength,
      lastModified: new Date().toISOString(),
      mode: "live",
    };
    const pruned = await pruneTarget("r2", await listR2());
    return { target, entry, pruned, mode: "live" };
  }

  const cfg = getDriveBackupConfig();
  if (!cfg) {
    const entry = writeMock("drive", name, bytes);
    const pruned = await pruneTarget("drive", await listDrive());
    return { target, entry, pruned, mode: "mock" };
  }
  const uploaded = await driveUploadFile(cfg, name, bytes);
  const entry: BackupEntry = {
    target: "drive",
    key: uploaded.id,
    name: uploaded.name,
    size: uploaded.size,
    lastModified: uploaded.modifiedTime?.toISOString() ?? new Date().toISOString(),
    mode: "live",
  };
  const pruned = await pruneTarget("drive", await listDrive());
  return { target, entry, pruned, mode: "live" };
}

export async function uploadBackupToTargets(
  bytes: Uint8Array,
  targets: BackupTarget[],
  opts?: { fileName?: string },
): Promise<UploadResult[]> {
  const fileName = opts?.fileName ?? backupDumpFileName();
  const results: UploadResult[] = [];
  for (const target of targets) {
    results.push(await uploadBackupToTarget(target, bytes, { fileName }));
  }
  return results;
}

export async function downloadBackup(target: BackupTarget, key: string): Promise<{ bytes: Uint8Array; name: string }> {
  if (target === "r2") {
    const cfg = getR2Config();
    if (!cfg) {
      const bytes = readMock("r2", key);
      return { bytes, name: key };
    }
    const bytes = await r2GetObject(cfg, key);
    return { bytes, name: key.split("/").pop() ?? key };
  }
  const cfg = getDriveBackupConfig();
  if (!cfg) {
    const bytes = readMock("drive", key);
    return { bytes, name: key };
  }
  const listed = await listDrive();
  const meta = listed.find((row) => row.key === key);
  const bytes = await driveDownloadFile(cfg, key);
  return { bytes, name: meta?.name ?? key };
}

export function resolveBackupTargets(requested?: BackupTarget[] | null): BackupTarget[] {
  if (requested && requested.length > 0) return requested;
  const configured: BackupTarget[] = [];
  if (hasR2Config()) configured.push("r2");
  if (hasDriveBackupConfig()) configured.push("drive");
  // Без секретов — mock на оба, чтобы on-demand и cron не падали локально.
  return configured.length > 0 ? configured : ["r2", "drive"];
}
