import { exportLedger } from "@/lib/db/file-store";
import { backupDumpFileName } from "@/lib/backup/naming";
import { uploadBackup, type UploadResult } from "@/lib/backup/store";

export type BackupJobResult = {
  ok: true;
  fileName: string;
  revision: number;
  size: number;
  upload: UploadResult;
};

/** Daily / on-demand: dump текущего ledger → Google Drive ledvision2026 (mock только если ALLOW_BACKUP_MOCK / не shared). */
export async function runBackupJob(): Promise<BackupJobResult> {
  const snapshot = await exportLedger();
  const fileName = backupDumpFileName();
  const upload = await uploadBackup(snapshot.bytes, { fileName });
  return {
    ok: true,
    fileName,
    revision: snapshot.revision,
    size: snapshot.bytes.byteLength,
    upload,
  };
}
