import { normalizeEmail } from "@/lib/email-auth/normalize";
import type { EmailAuthSession } from "@/lib/email-auth/types";

export const EMAIL_AUTH_KEY = "led-warehouse:email-auth";

type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserAuthStorage(): KeyValueStore | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export function readEmailAuthSession(storage: KeyValueStore | undefined): EmailAuthSession | null {
  if (!storage) return null;
  const raw = storage.getItem(EMAIL_AUTH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EmailAuthSession;
    const email = normalizeEmail(parsed.email ?? "");
    if (!email || typeof parsed.loggedInAt !== "number") {
      storage.removeItem(EMAIL_AUTH_KEY);
      return null;
    }
    return {
      email,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      loggedInAt: parsed.loggedInAt,
    };
  } catch {
    storage.removeItem(EMAIL_AUTH_KEY);
    return null;
  }
}

export function writeEmailAuthSession(storage: KeyValueStore | undefined, session: EmailAuthSession): void {
  storage?.setItem(
    EMAIL_AUTH_KEY,
    JSON.stringify({
      email: normalizeEmail(session.email),
      userId: session.userId,
      loggedInAt: session.loggedInAt,
    }),
  );
}

/** Только email-сессия. Токен Google Calendar не трогаем. */
export function clearEmailAuthSession(storage: KeyValueStore | undefined): void {
  storage?.removeItem(EMAIL_AUTH_KEY);
}
