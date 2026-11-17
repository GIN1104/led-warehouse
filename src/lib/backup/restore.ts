import { forceReplaceLedger } from "@/lib/db/file-store";
import type { BackupTarget } from "@/lib/backup/config";
import { downloadBackup } from "@/lib/backup/store";

export type RestoreResult = {
  ok: true;
  target: BackupTarget;
  key: string;
  name: string;
  revision: number;
  size: number;
};

/**
 * Скачать dump с target и применить к локальному ledger (+ push Turso через replaceNeedsPush).
 * Вызывать только после assertBackupOwnerEmail + CONFIRM.
 */
export async function restoreFromBackup(target: BackupTarget, key: string): Promise<RestoreResult> {
  const { bytes, name } = await downloadBackup(target, key);
  if (bytes.byteLength < 64) throw new Error("Dump слишком маленький или пустой");
  // SQLite header "SQLite format 3\0"
  const header = Buffer.from(bytes.subarray(0, 16)).toString("utf8");
  if (!header.startsWith("SQLite format 3")) {
    throw new Error("Файл не похож на SQLite dump");
  }
  const { revision } = await forceReplaceLedger(bytes);
  return {
    ok: true,
    target,
    key,
    name,
    revision,
    size: bytes.byteLength,
  };
}
