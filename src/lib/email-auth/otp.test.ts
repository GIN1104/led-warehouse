import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOW_EMAIL, PERMANENT_OWNER_EMAIL } from "@/lib/email-auth/allowlist-policy";
import {
  clearPendingOtp,
  issueLocalOtp,
  isEmailAllowed,
  verifyLocalOtp,
} from "@/lib/email-auth/otp";
import { clearEmailAuthSession, readEmailAuthSession, writeEmailAuthSession } from "@/lib/email-auth/session";

function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  } as Storage;
}

describe("email OTP allowlist и mock", () => {
  it("пускает permanent owner и адреса из allowlist; seed local — нет", () => {
    expect(isEmailAllowed("StarchenkoGin@gmail.com", [])).toBe(true);
    expect(isEmailAllowed(DEFAULT_ALLOW_EMAIL, [DEFAULT_ALLOW_EMAIL])).toBe(true);
    expect(isEmailAllowed("alexey@led.local", [])).toBe(false);
    expect(isEmailAllowed("stranger@x.com", [DEFAULT_ALLOW_EMAIL])).toBe(false);
  });

  it("выдаёт и проверяет код для allowed email", () => {
    const storage = memoryStore();
    const issued = issueLocalOtp({
      email: `  ${PERMANENT_OWNER_EMAIL} `,
      directoryEmails: [],
      storage,
      now: 1_000,
      random: () => 0.123456,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok || issued.mode !== "mock") throw new Error("ожидали mock OTP");
    expect(issued.code).toMatch(/^\d{6}$/);

    const bad = verifyLocalOtp({ email: issued.email, code: "000000", storage, now: 1_001 });
    expect(bad).toEqual({ ok: false, reason: "mismatch" });

    const ok = verifyLocalOtp({ email: issued.email, code: issued.code, storage, now: 1_002 });
    expect(ok).toEqual({ ok: true, email: PERMANENT_OWNER_EMAIL });

    const again = verifyLocalOtp({ email: issued.email, code: issued.code, storage, now: 1_003 });
    expect(again).toEqual({ ok: false, reason: "no_pending" });
  });

  it("режет email вне allowlist и просроченный OTP", () => {
    const storage = memoryStore();
    expect(issueLocalOtp({ email: "nope@x.com", directoryEmails: [], storage }).ok).toBe(false);

    const issued = issueLocalOtp({
      email: PERMANENT_OWNER_EMAIL,
      directoryEmails: [],
      storage,
      now: 0,
      random: () => 0.5,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok || issued.mode !== "mock") throw new Error("ожидали mock OTP");
    expect(verifyLocalOtp({ email: issued.email, code: issued.code, storage, now: 11 * 60 * 1000 })).toEqual({
      ok: false,
      reason: "expired",
    });
    clearPendingOtp(storage);
  });

  it("хранит email-сессию отдельно от Google", () => {
    const storage = memoryStore();
    writeEmailAuthSession(storage, { email: PERMANENT_OWNER_EMAIL, userId: "user_owner", loggedInAt: 42 });
    expect(readEmailAuthSession(storage)).toEqual({
      email: PERMANENT_OWNER_EMAIL,
      userId: "user_owner",
      loggedInAt: 42,
    });
    clearEmailAuthSession(storage);
    expect(readEmailAuthSession(storage)).toBeNull();
  });
});
