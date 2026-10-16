import { isValidEmailShape, normalizeEmail } from "@/lib/email-auth/normalize";
import type { OtpIssueResult, OtpVerifyResult, PendingOtp } from "@/lib/email-auth/types";

export const PENDING_OTP_KEY = "led-warehouse:pending-otp";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserOtpStorage(): KeyValueStore | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  return sessionStorage;
}

/** Демо-адреса seed-пользователей — всегда в allowlist на Pages. */
export const BOOTSTRAP_ALLOWLIST: readonly string[] = ["alexey@led.local", "dmitry@led.local"] as const;

export function generateOtpCode(random = Math.random): string {
  const n = Math.floor(random() * 1_000_000);
  return String(n).padStart(6, "0");
}

export function readPendingOtp(storage: KeyValueStore | undefined): PendingOtp | null {
  if (!storage) return null;
  const raw = storage.getItem(PENDING_OTP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingOtp;
    if (!parsed.email || !parsed.code || typeof parsed.expiresAt !== "number") {
      storage.removeItem(PENDING_OTP_KEY);
      return null;
    }
    return {
      email: normalizeEmail(parsed.email),
      code: String(parsed.code),
      expiresAt: parsed.expiresAt,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    };
  } catch {
    storage.removeItem(PENDING_OTP_KEY);
    return null;
  }
}

export function writePendingOtp(storage: KeyValueStore | undefined, pending: PendingOtp): void {
  storage?.setItem(PENDING_OTP_KEY, JSON.stringify(pending));
}

export function clearPendingOtp(storage: KeyValueStore | undefined): void {
  storage?.removeItem(PENDING_OTP_KEY);
}

export function isEmailAllowed(email: string, directoryEmails: readonly string[]): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const set = new Set([...BOOTSTRAP_ALLOWLIST, ...directoryEmails.map(normalizeEmail)].filter(Boolean));
  return set.has(normalized);
}

/**
 * Выпуск OTP на клиенте (Pages MVP / mock).
 * Реальная отправка письма — только через BFF при RESEND_API_KEY.
 */
export function issueLocalOtp(input: {
  email: string;
  directoryEmails: readonly string[];
  storage: KeyValueStore | undefined;
  now?: number;
  random?: () => number;
}): OtpIssueResult {
  const email = normalizeEmail(input.email);
  if (!isValidEmailShape(email)) return { ok: false, reason: "invalid_email" };
  if (!isEmailAllowed(email, input.directoryEmails)) return { ok: false, reason: "not_allowed" };

  const now = input.now ?? Date.now();
  const code = generateOtpCode(input.random);
  const expiresAt = now + OTP_TTL_MS;
  writePendingOtp(input.storage, { email, code, expiresAt, attempts: 0 });
  return { ok: true, mode: "mock", code, expiresAt, email };
}

export function verifyLocalOtp(input: {
  email: string;
  code: string;
  storage: KeyValueStore | undefined;
  now?: number;
}): OtpVerifyResult {
  const email = normalizeEmail(input.email);
  if (!isValidEmailShape(email)) return { ok: false, reason: "invalid_email" };

  const pending = readPendingOtp(input.storage);
  if (!pending || pending.email !== email) return { ok: false, reason: "no_pending" };

  const now = input.now ?? Date.now();
  if (now > pending.expiresAt) {
    clearPendingOtp(input.storage);
    return { ok: false, reason: "expired" };
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    clearPendingOtp(input.storage);
    return { ok: false, reason: "too_many" };
  }

  const code = String(input.code).trim();
  if (code !== pending.code) {
    const attempts = pending.attempts + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      clearPendingOtp(input.storage);
      return { ok: false, reason: "too_many" };
    }
    writePendingOtp(input.storage, { ...pending, attempts });
    return { ok: false, reason: "mismatch" };
  }

  clearPendingOtp(input.storage);
  return { ok: true, email };
}
