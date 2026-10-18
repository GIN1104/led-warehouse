import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { seedIfEmpty } from "@/lib/db/seed";
import {
  DEFAULT_ALLOW_EMAIL,
  PERMANENT_OWNER_EMAIL,
} from "@/lib/email-auth/allowlist-policy";
import {
  approveAccessRequest,
  canManageAccess,
  isEmailActivelyAllowed,
  listAccessRequests,
  listAllowedEmails,
  rejectAccessRequest,
  requestAccessOrLogin,
  revokeAllowedEmail,
} from "@/lib/services/access-requests";

describe("access requests и allowlist policy", () => {
  it("permanent owner всегда входит и нельзя отозвать", () => {
    const db = createDb();
    seedIfEmpty(db);
    expect(isEmailActivelyAllowed(db, PERMANENT_OWNER_EMAIL)).toBe(true);
    const login = requestAccessOrLogin(db, "  StarchenkoGin@gmail.com ");
    expect(login.kind).toBe("logged_in");
    expect(() => revokeAllowedEmail(db, PERMANENT_OWNER_EMAIL, PERMANENT_OWNER_EMAIL)).toThrow(/нельзя отозвать/);
    const list = listAllowedEmails(db);
    expect(list.some((row) => row.email === PERMANENT_OWNER_EMAIL && row.permanent)).toBe(true);
  });

  it("ledvision в allowlist по умолчанию и можно отозвать", () => {
    const db = createDb();
    seedIfEmpty(db);
    expect(isEmailActivelyAllowed(db, DEFAULT_ALLOW_EMAIL)).toBe(true);
    expect(requestAccessOrLogin(db, DEFAULT_ALLOW_EMAIL).kind).toBe("logged_in");
    revokeAllowedEmail(db, DEFAULT_ALLOW_EMAIL, PERMANENT_OWNER_EMAIL);
    expect(isEmailActivelyAllowed(db, DEFAULT_ALLOW_EMAIL)).toBe(false);
    expect(requestAccessOrLogin(db, DEFAULT_ALLOW_EMAIL).kind).toBe("pending");
  });

  it("чужой email создаёт pending; approve только менеджерами доступа", () => {
    const db = createDb();
    seedIfEmpty(db);
    const pending = requestAccessOrLogin(db, "new@company.com");
    expect(pending.kind).toBe("pending");
    if (pending.kind !== "pending") throw new Error("ожидали pending");

    expect(() => approveAccessRequest(db, pending.requestId, "alexey@led.local")).toThrow(/Управлять доступом/);
    approveAccessRequest(db, pending.requestId, PERMANENT_OWNER_EMAIL);
    expect(isEmailActivelyAllowed(db, "new@company.com")).toBe(true);
    expect(requestAccessOrLogin(db, "new@company.com").kind).toBe("logged_in");
  });

  it("seed alexey/dmitry больше не входят автоматически", () => {
    const db = createDb();
    seedIfEmpty(db);
    expect(requestAccessOrLogin(db, "alexey@led.local").kind).toBe("pending");
    expect(requestAccessOrLogin(db, "dmitry@led.local").kind).toBe("pending");
  });

  it("reject и повторная заявка; canManageAccess только двум email", () => {
    const db = createDb();
    seedIfEmpty(db);
    expect(canManageAccess(PERMANENT_OWNER_EMAIL)).toBe(true);
    expect(canManageAccess(DEFAULT_ALLOW_EMAIL)).toBe(true);
    expect(canManageAccess("other@x.com")).toBe(false);

    const pending = requestAccessOrLogin(db, "other@x.com");
    expect(pending.kind).toBe("pending");
    if (pending.kind !== "pending") throw new Error("ожидали pending");
    rejectAccessRequest(db, pending.requestId, DEFAULT_ALLOW_EMAIL);
    expect(listAccessRequests(db, { status: "rejected" })).toHaveLength(1);
    const again = requestAccessOrLogin(db, "other@x.com");
    expect(again.kind).toBe("pending");
  });

  it("режет некорректный email", () => {
    const db = createDb();
    expect(requestAccessOrLogin(db, "not-an-email")).toEqual({ kind: "invalid_email" });
  });
});
