import { normalizeEmail } from "@/lib/email-auth/normalize";

/** Владелец: всегда разрешён, с любого устройства, revoke запрещён. */
export const PERMANENT_OWNER_EMAIL = "starchenkogin@gmail.com";

/**
 * Проектный Google-аккаунт: в allowlist по умолчанию, revoke разрешён.
 * Управление доступом — вместе с владельцем.
 */
export const DEFAULT_ALLOW_EMAIL = "ledvision2026.il@gmail.com";

/** Кто может approve / reject / revoke / ручное добавление. */
export const ACCESS_MANAGER_EMAILS: readonly string[] = [
  PERMANENT_OWNER_EMAIL,
  DEFAULT_ALLOW_EMAIL,
] as const;

export function isPermanentOwnerEmail(email: string): boolean {
  return normalizeEmail(email) === PERMANENT_OWNER_EMAIL;
}

export function isDefaultAllowEmail(email: string): boolean {
  return normalizeEmail(email) === DEFAULT_ALLOW_EMAIL;
}

export function isAccessManagerEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return ACCESS_MANAGER_EMAILS.includes(normalized);
}
