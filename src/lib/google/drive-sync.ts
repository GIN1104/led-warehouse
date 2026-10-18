import {
  GOOGLE_DRIVE_FILE_SCOPE,
  PROJECT_DRIVE_EXCEL_FOLDER,
  PROJECT_GOOGLE_EMAIL,
  googleClientId,
} from "@/lib/google/config";
import { buildDriveExcelFileName, type DriveExcelFileNameInput } from "@/lib/google/drive-filename";

export type DriveSyncStatus =
  | { kind: "manual"; email: string; folder: string }
  | { kind: "missing_client_id"; email: string; folder: string }
  | { kind: "stub"; email: string; folder: string; message: string };

export {
  buildDriveExcelFileName,
  driveFileNameFromMapperDraft,
  formatDriveDateStamp,
  sanitizeDriveEventName,
} from "@/lib/google/drive-filename";

/**
 * Заглушка Drive: MVP = ручная загрузка Excel в папку аккаунта.
 * Имя файла при сохранении/экспорте — ДД-ММ-ГГГГ (см. buildDriveExcelFileName).
 * API upload / Picker — после OAuth; Calendar scopes не расширяем здесь.
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
    message:
      "Drive API upload ещё не подключён. Кладите Excel вручную в папку на Drive; имя: ДД-ММ-ГГГГ или ДД-ММ-ГГГГ Событие.xlsx.",
  };
}

export function driveManualHint(): { email: string; folder: string; scope: string; nameExample: string } {
  return {
    email: PROJECT_GOOGLE_EMAIL,
    folder: PROJECT_DRIVE_EXCEL_FOLDER,
    scope: GOOGLE_DRIVE_FILE_SCOPE,
    nameExample: buildDriveExcelFileName({ date: "2026-10-18", eventName: "Имя события" }),
  };
}

/** Имя для upload/export на Drive (дата первой). */
export function driveUploadFileName(input: DriveExcelFileNameInput): string {
  return buildDriveExcelFileName(input);
}

/**
 * Скачать blob локально с именем Drive (ручная загрузка в папку).
 * Не трогает GIS / Calendar auth.
 */
export function downloadBlobForDrive(blob: Blob, input: DriveExcelFileNameInput): string {
  if (typeof document === "undefined") {
    throw new Error("Скачивание для Drive только в браузере");
  }
  const name = buildDriveExcelFileName(input);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return name;
}
