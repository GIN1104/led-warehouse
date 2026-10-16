/** Сессия входа по email (не путать с GIS-токеном Calendar). */
export type EmailAuthSession = {
  email: string;
  /** id человека из справочника, если email совпал */
  userId: string | null;
  loggedInAt: number;
};

export type PendingOtp = {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
};

export type OtpIssueResult =
  | { ok: true; mode: "mock"; code: string; expiresAt: number; email: string }
  | { ok: true; mode: "sent"; expiresAt: number; email: string }
  | { ok: false; reason: "not_allowed" | "invalid_email" };

export type OtpVerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: "no_pending" | "expired" | "mismatch" | "too_many" | "invalid_email" };
