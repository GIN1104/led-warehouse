/** Env для Google Drive backup. Значения секретов в репо не кладём. */

export type DriveBackupConfig = {
  /** Сырой JSON service account (Fly secret). */
  serviceAccountJson: string;
  folderId: string;
};

/**
 * Серверный бэкап на Drive — через service account JSON + id папки.
 * Целевая папка: Google Drive аккаунта LED Vision (ledvision2026), shared Editor на SA.
 * GIS-токены браузера (Calendar) для server cron не подходят.
 * Cloudflare R2 не используем (нужна карта — отказ Evgeny).
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
