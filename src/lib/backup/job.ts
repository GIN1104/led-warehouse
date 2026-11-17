import { exportLedger } from "@/lib/db/file-store";
import { backupDumpFileName } from "@/lib/backup/naming";
import {
  resolveBackupTargets,
  uploadBackupToTargets,
  type UploadResult,
} from "@/lib/backup/store";
import type { BackupTarget } from "@/lib/backup/config";

export type BackupJobResult = {
  ok: true;
  fileName: string;
  revision: number;
  size: number;
  uploads: UploadResult[];
};

/** Daily / on-demand: dump текущего ledger → R2 и/или Drive (mock если secrets нет). */
export async function runBackupJob(opts?: { targets?: BackupTarget[] }): Promise<BackupJobResult> {
  const snapshot = await exportLedger();
  const fileName = backupDumpFileName();
  const targets = resolveBackupTargets(opts?.targets);
  const uploads = await uploadBackupToTargets(snapshot.bytes, targets, { fileName });
  return {
    ok: true,
    fileName,
    revision: snapshot.revision,
    size: snapshot.bytes.byteLength,
    uploads,
  };
}
