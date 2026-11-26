/** Env для Google Drive backup. Значения секретов в репо не кладём. */

import { DEFAULT_ALLOW_EMAIL } from "@/lib/email-auth/allowlist-policy";

/** Папка бэкапов живёт на Drive этого аккаунта (не personal starchenkogin). */
export const DRIVE_BACKUP_ACCOUNT_EMAIL = DEFAULT_ALLOW_EMAIL;

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

/**
 * Mock dump на диске API разрешён только явно (dev) или без shared host.
 * На Render/Fly (`NEXT_PUBLIC_SHARED=1`) без Drive secrets — ошибка, не тихий mock.
 */
export function allowBackupMock(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.ALLOW_BACKUP_MOCK ?? "").trim() === "1") return true;
  if ((env.NEXT_PUBLIC_SHARED ?? "").trim() === "1") return false;
  return true;
}

export function assertDriveBackupConfigured(env: Record<string, string | undefined> = process.env): void {
  if (hasDriveBackupConfig(env)) return;
  if (allowBackupMock(env)) return;
  throw new Error(
    `Google Drive secrets не заданы на API (GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_BACKUP_FOLDER_ID). Папка бэкапов — Drive ${DRIVE_BACKUP_ACCOUNT_EMAIL}. Mock на shared host отключён.`,
  );
}

/** Секрет для Fly cron / scripts без owner email (только create backup). */
export function getBackupCronSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.BACKUP_CRON_SECRET ?? "").trim();
}
