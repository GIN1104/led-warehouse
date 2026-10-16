import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ALLOWLIST,
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
  it("пускает bootstrap и адреса из people", () => {
    expect(isEmailAllowed("Alexey@Led.Local", [])).toBe(true);
    expect(isEmailAllowed("new@company.com", ["new@company.com"])).toBe(true);
    expect(isEmailAllowed("stranger@x.com", ["new@company.com"])).toBe(false);
    expect(BOOTSTRAP_ALLOWLIST).toContain("dmitry@led.local");
  });

  it("выдаёт и проверяет код; отклоняет чужой email и просрочку", () => {
    const storage = memoryStore();
    const issued = issueLocalOtp({
      email: "  DMITRY@LED.LOCAL ",
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
    expect(ok).toEqual({ ok: true, email: "dmitry@led.local" });

    const again = verifyLocalOtp({ email: issued.email, code: issued.code, storage, now: 1_003 });
    expect(again).toEqual({ ok: false, reason: "no_pending" });
  });

  it("режет email вне allowlist и просроченный OTP", () => {
    const storage = memoryStore();
    expect(issueLocalOtp({ email: "nope@x.com", directoryEmails: [], storage }).ok).toBe(false);

    const issued = issueLocalOtp({
      email: "alexey@led.local",
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
    writeEmailAuthSession(storage, { email: "dmitry@led.local", userId: "user_manager", loggedInAt: 42 });
    expect(readEmailAuthSession(storage)).toEqual({
      email: "dmitry@led.local",
      userId: "user_manager",
      loggedInAt: 42,
    });
    clearEmailAuthSession(storage);
    expect(readEmailAuthSession(storage)).toBeNull();
  });
});
