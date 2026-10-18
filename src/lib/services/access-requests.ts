import { DomainError } from "@/lib/domain/errors";
import {
  DEFAULT_ALLOW_EMAIL,
  isAccessManagerEmail,
  isPermanentOwnerEmail,
  PERMANENT_OWNER_EMAIL,
} from "@/lib/email-auth/allowlist-policy";
import { isValidEmailShape, normalizeEmail } from "@/lib/email-auth/normalize";
import { newId, type Sql } from "@/lib/db/sql";
import { createPerson } from "@/lib/services/people";
import { findUserByEmail, type Role, type UserRow } from "@/lib/services/queries";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequestRow = {
  id: string;
  email: string;
  status: AccessRequestStatus;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
};

export type AllowedEmailRow = {
  email: string;
  approvedAt: number;
  approvedBy: string | null;
  revokedAt: number | null;
  /** Hardcoded permanent — revoke UI скрыт. */
  permanent: boolean;
};

export type AccessLoginOutcome =
  | { kind: "logged_in"; email: string; userId: string | null }
  | { kind: "pending"; email: string; requestId: string }
  | { kind: "invalid_email" };

type AccessRequestDbRow = {
  id: string;
  email: string;
  status: AccessRequestStatus;
  created_at: number;
  decided_by: string | null;
  decided_at: number | null;
};

type AllowedEmailDbRow = {
  email: string;
  approved_at: number;
  approved_by: string | null;
  revoked_at: number | null;
};

function mapRequest(row: AccessRequestDbRow): AccessRequestRow {
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    status: row.status,
    createdAt: row.created_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}

function mapAllowed(row: AllowedEmailDbRow): AllowedEmailRow {
  const email = normalizeEmail(row.email);
  return {
    email,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    revokedAt: row.revoked_at,
    permanent: isPermanentOwnerEmail(email),
  };
}

function assertEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!isValidEmailShape(email)) throw new DomainError("Укажите корректный email");
  return email;
}

export function assertCanManageAccess(actorEmail: string): void {
  if (!isAccessManagerEmail(actorEmail)) {
    throw new DomainError("Управлять доступом могут только starchenkogin@gmail.com и ledvision2026.il@gmail.com");
  }
}

export function canManageAccess(actorEmail: string | null | undefined): boolean {
  if (!actorEmail) return false;
  return isAccessManagerEmail(actorEmail);
}

/** Активный допуск: permanent owner ИЛИ строка в allowed_emails без revoke. */
export function isEmailActivelyAllowed(db: Sql, email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isPermanentOwnerEmail(normalized)) return true;
  const row = db.get<{ email: string }>(
    `SELECT email FROM allowed_emails WHERE email = ? AND revoked_at IS NULL`,
    [normalized],
  );
  return Boolean(row);
}

export function listAllowedEmails(db: Sql, opts?: { includeRevoked?: boolean }): AllowedEmailRow[] {
  const sql = opts?.includeRevoked
    ? `SELECT email, approved_at, approved_by, revoked_at FROM allowed_emails ORDER BY approved_at DESC`
    : `SELECT email, approved_at, approved_by, revoked_at FROM allowed_emails WHERE revoked_at IS NULL ORDER BY approved_at DESC`;
  const rows = db.all<AllowedEmailDbRow>(sql).map(mapAllowed);
  // Permanent owner всегда в UI-списке, даже без строки в таблице.
  if (!opts?.includeRevoked && !rows.some((row) => isPermanentOwnerEmail(row.email))) {
    rows.unshift({
      email: PERMANENT_OWNER_EMAIL,
      approvedAt: 0,
      approvedBy: "hardcoded",
      revokedAt: null,
      permanent: true,
    });
  }
  return rows;
}

export function listDirectoryAllowEmails(db: Sql): string[] {
  const fromTable = db
    .all<{ email: string }>(`SELECT email FROM allowed_emails WHERE revoked_at IS NULL`)
    .map((row) => normalizeEmail(row.email));
  return [...new Set([PERMANENT_OWNER_EMAIL, ...fromTable])];
}

export function listAccessRequests(
  db: Sql,
  opts?: { status?: AccessRequestStatus },
): AccessRequestRow[] {
  if (opts?.status) {
    return db
      .all<AccessRequestDbRow>(
        `SELECT id, email, status, created_at, decided_by, decided_at
         FROM access_requests WHERE status = ? ORDER BY created_at DESC`,
        [opts.status],
      )
      .map(mapRequest);
  }
  return db
    .all<AccessRequestDbRow>(
      `SELECT id, email, status, created_at, decided_by, decided_at
       FROM access_requests ORDER BY created_at DESC`,
    )
    .map(mapRequest);
}

export function findPendingRequest(db: Sql, email: string): AccessRequestRow | undefined {
  const normalized = normalizeEmail(email);
  const row = db.get<AccessRequestDbRow>(
    `SELECT id, email, status, created_at, decided_by, decided_at
     FROM access_requests WHERE email = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [normalized],
  );
  return row ? mapRequest(row) : undefined;
}

export function ensureAllowedEmail(
  db: Sql,
  email: string,
  approvedBy: string | null,
  now = Date.now(),
): AllowedEmailRow {
  const normalized = assertEmail(email);
  if (isPermanentOwnerEmail(normalized)) {
    return {
      email: normalized,
      approvedAt: now,
      approvedBy: approvedBy ?? "hardcoded",
      revokedAt: null,
      permanent: true,
    };
  }
  const existing = db.get<AllowedEmailDbRow>(
    `SELECT email, approved_at, approved_by, revoked_at FROM allowed_emails WHERE email = ?`,
    [normalized],
  );
  if (existing && existing.revoked_at == null) {
    return mapAllowed(existing);
  }
  if (existing) {
    db.run(
      `UPDATE allowed_emails SET approved_at = ?, approved_by = ?, revoked_at = NULL WHERE email = ?`,
      [now, approvedBy, normalized],
    );
  } else {
    db.run(`INSERT INTO allowed_emails (email, approved_at, approved_by, revoked_at) VALUES (?, ?, ?, NULL)`, [
      normalized,
      now,
      approvedBy,
    ]);
  }
  return {
    email: normalized,
    approvedAt: now,
    approvedBy,
    revokedAt: null,
    permanent: false,
  };
}

export function revokeAllowedEmail(db: Sql, email: string, actorEmail: string, now = Date.now()): void {
  assertCanManageAccess(actorEmail);
  const normalized = assertEmail(email);
  if (isPermanentOwnerEmail(normalized)) {
    throw new DomainError("Этот email нельзя отозвать");
  }
  const row = db.get<{ email: string }>(
    `SELECT email FROM allowed_emails WHERE email = ? AND revoked_at IS NULL`,
    [normalized],
  );
  if (!row) throw new DomainError("Email не в списке допущенных");
  db.run(`UPDATE allowed_emails SET revoked_at = ? WHERE email = ?`, [now, normalized]);
}

export function addAllowedEmailManual(
  db: Sql,
  email: string,
  actorEmail: string,
  opts?: { role?: Role; now?: number },
): AllowedEmailRow {
  assertCanManageAccess(actorEmail);
  const now = opts?.now ?? Date.now();
  const normalized = assertEmail(email);
  const row = ensureAllowedEmail(db, normalized, actorEmail, now);
  if (!isPermanentOwnerEmail(normalized)) {
    ensurePersonForEmail(db, normalized, opts?.role ?? "warehouse");
  }
  return row;
}

function ensurePersonForEmail(db: Sql, email: string, role: Role, nameHint?: string): UserRow {
  const existing = findUserByEmail(db, email);
  if (existing) return existing;
  const local = email.split("@")[0] || "user";
  const name = (nameHint?.trim() || local).slice(0, 80);
  return createPerson(db, { name, role, email });
}

export function createAccessRequest(db: Sql, email: string, now = Date.now()): AccessRequestRow {
  const normalized = assertEmail(email);
  const pending = findPendingRequest(db, normalized);
  if (pending) return pending;
  const id = `ar_${newId().replace(/-/g, "").slice(0, 12)}`;
  db.run(
    `INSERT INTO access_requests (id, email, status, created_at, decided_by, decided_at)
     VALUES (?, ?, 'pending', ?, NULL, NULL)`,
    [id, normalized, now],
  );
  return {
    id,
    email: normalized,
    status: "pending",
    createdAt: now,
    decidedBy: null,
    decidedAt: null,
  };
}

export function approveAccessRequest(
  db: Sql,
  requestId: string,
  actorEmail: string,
  opts?: { role?: Role; now?: number },
): AccessRequestRow {
  assertCanManageAccess(actorEmail);
  const now = opts?.now ?? Date.now();
  const row = db.get<AccessRequestDbRow>(
    `SELECT id, email, status, created_at, decided_by, decided_at FROM access_requests WHERE id = ?`,
    [requestId],
  );
  if (!row) throw new DomainError("Заявка не найдена");
  if (row.status !== "pending") throw new DomainError("Заявка уже обработана");
  const email = normalizeEmail(row.email);
  ensureAllowedEmail(db, email, actorEmail, now);
  ensurePersonForEmail(db, email, opts?.role ?? "warehouse");
  db.run(
    `UPDATE access_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?`,
    [actorEmail, now, requestId],
  );
  return {
    id: row.id,
    email,
    status: "approved",
    createdAt: row.created_at,
    decidedBy: actorEmail,
    decidedAt: now,
  };
}

export function rejectAccessRequest(
  db: Sql,
  requestId: string,
  actorEmail: string,
  now = Date.now(),
): AccessRequestRow {
  assertCanManageAccess(actorEmail);
  const row = db.get<AccessRequestDbRow>(
    `SELECT id, email, status, created_at, decided_by, decided_at FROM access_requests WHERE id = ?`,
    [requestId],
  );
  if (!row) throw new DomainError("Заявка не найдена");
  if (row.status !== "pending") throw new DomainError("Заявка уже обработана");
  db.run(
    `UPDATE access_requests SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?`,
    [actorEmail, now, requestId],
  );
  return {
    id: row.id,
    email: normalizeEmail(row.email),
    status: "rejected",
    createdAt: row.created_at,
    decidedBy: actorEmail,
    decidedAt: now,
  };
}

/**
 * Вход / заявка.
 * - permanent owner / allowlist → сразу сессия
 * - иначе pending заявка (повтор не дублирует)
 */
export function requestAccessOrLogin(db: Sql, rawEmail: string, now = Date.now()): AccessLoginOutcome {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmailShape(email)) return { kind: "invalid_email" };

  if (isEmailActivelyAllowed(db, email)) {
    let user = findUserByEmail(db, email);
    if (!user && (isPermanentOwnerEmail(email) || email === DEFAULT_ALLOW_EMAIL)) {
      user = ensurePersonForEmail(
        db,
        email,
        isPermanentOwnerEmail(email) ? "admin" : "manager",
        isPermanentOwnerEmail(email) ? "Owner" : "LED Vision",
      );
    }
    return { kind: "logged_in", email, userId: user?.id ?? null };
  }

  const pending = findPendingRequest(db, email);
  if (pending) {
    return { kind: "pending", email, requestId: pending.id };
  }

  const request = createAccessRequest(db, email, now);
  return { kind: "pending", email, requestId: request.id };
}
