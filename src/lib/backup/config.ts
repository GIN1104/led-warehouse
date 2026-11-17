/** Env для R2 и Google Drive backup. Значения секретов в репо не кладём. */

export type BackupTarget = "r2" | "drive";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export type DriveBackupConfig = {
  /** Сырой JSON service account (Fly secret). */
  serviceAccountJson: string;
  folderId: string;
};

export function r2BucketName(env: Record<string, string | undefined> = process.env): string {
  return (env.R2_BUCKET ?? "ledvision-backups").trim() || "ledvision-backups";
}

export function getR2Config(env: Record<string, string | undefined> = process.env): R2Config | null {
  const accountId = (env.R2_ACCOUNT_ID ?? "").trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY ?? "").trim();
  const bucket = r2BucketName(env);
  const endpointRaw = (env.R2_ENDPOINT ?? "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  const endpoint = endpointRaw || `https://${accountId}.r2.cloudflarestorage.com`;
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

export function hasR2Config(env: Record<string, string | undefined> = process.env): boolean {
  return getR2Config(env) !== null;
}

/**
 * Серверный бэкап на Drive — через service account JSON + id папки.
 * GIS-токены браузера (Calendar) для cron на Fly не подходят.
 */
export function getDriveBackupConfig(
  env: Record<string, string | undefined> = process.env,
): DriveBackupConfig | null {
  const serviceAccountJson = (env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "").trim();
  const folderId = (env.GOOGLE_DRIVE_BACKUP_FOLDER_ID ?? "").trim();
  if (!serviceAccountJson || !folderId) return null;
  return { serviceAccountJson, folderId };
}

export function hasDriveBackupConfig(env: Record<string, string | undefined> = process.env): boolean {
  return getDriveBackupConfig(env) !== null;
}

/** Секрет для Fly cron / scripts без owner email (только create backup). */
export function getBackupCronSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.BACKUP_CRON_SECRET ?? "").trim();
}

export function backupTargetsConfigured(
  env: Record<string, string | undefined> = process.env,
): BackupTarget[] {
  const targets: BackupTarget[] = [];
  if (hasR2Config(env)) targets.push("r2");
  if (hasDriveBackupConfig(env)) targets.push("drive");
  return targets;
}
