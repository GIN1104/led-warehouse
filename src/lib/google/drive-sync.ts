import {
  GOOGLE_DRIVE_FILE_SCOPE,
  PROJECT_DRIVE_EXCEL_FOLDER,
  PROJECT_GOOGLE_EMAIL,
  googleClientId,
} from "@/lib/google/config";

export type DriveSyncStatus =
  | { kind: "manual"; email: string; folder: string }
  | { kind: "missing_client_id"; email: string; folder: string }
  | { kind: "stub"; email: string; folder: string; message: string };

/**
 * Заглушка Drive: MVP = ручная загрузка Excel в папку аккаунта.
 * API upload / Picker — после OAuth Client ID. Пароль не используется.
 */
export function getDriveSyncStatus(): DriveSyncStatus {
  const email = PROJECT_GOOGLE_EMAIL;
  const folder = PROJECT_DRIVE_EXCEL_FOLDER;
  const clientId = googleClientId();
  if (!clientId) {
    return { kind: "missing_client_id", email, folder };
  }
  return {
    kind: "stub",
    email,
    folder,
    message: "Drive API upload ещё не подключён. Кладите Excel вручную в папку на Drive.",
  };
}

export function driveManualHint(): { email: string; folder: string; scope: string } {
  return {
    email: PROJECT_GOOGLE_EMAIL,
    folder: PROJECT_DRIVE_EXCEL_FOLDER,
    scope: GOOGLE_DRIVE_FILE_SCOPE,
  };
}