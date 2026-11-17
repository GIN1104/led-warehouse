import { forceReplaceLedger } from "@/lib/db/file-store";
import { downloadBackup } from "@/lib/backup/store";

export type RestoreResult = {
  ok: true;
  key: string;
  name: string;
  revision: number;
  size: number;
};

/**
 * Скачать dump с Google Drive и применить к локальному ledger (+ push Turso).
 * Вызывать только после assertBackupOwnerEmail + CONFIRM.
 */
export async function restoreFromBackup(key: string): Promise<RestoreResult> {
  const { bytes, name } = await downloadBackup(key);
  if (bytes.byteLength < 64) throw new Error("Dump слишком маленький или пустой");
  const header = Buffer.from(bytes.subarray(0, 16)).toString("utf8");
  if (!header.startsWith("SQLite format 3")) {
    throw new Error("Файл не похож на SQLite dump");
  }
  const { revision } = await forceReplaceLedger(bytes);
  return {
    ok: true,
    key,
    name,
    revision,
    size: bytes.byteLength,
  };
}
