import { isPermanentOwnerEmail, PERMANENT_OWNER_EMAIL } from "@/lib/email-auth/allowlist-policy";
import { normalizeEmail } from "@/lib/email-auth/normalize";

export { PERMANENT_OWNER_EMAIL };

export const RESTORE_CONFIRM_PHRASE = "CONFIRM";

/** Restore / list / download — только starchenkogin@gmail.com. */
export function assertBackupOwnerEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isPermanentOwnerEmail(normalized)) {
    throw new Error("Только владелец starchenkogin@gmail.com может работать с бэкапами");
  }
  return normalized;
}

export function isBackupOwnerEmail(email: string): boolean {
  return isPermanentOwnerEmail(email);
}

export function assertRestoreConfirm(confirm: string): void {
  if (String(confirm ?? "").trim() !== RESTORE_CONFIRM_PHRASE) {
    throw new Error(`Для восстановления введите ${RESTORE_CONFIRM_PHRASE}`);
  }
}
