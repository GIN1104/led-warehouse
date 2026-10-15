import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";
import type { Role, UserRow } from "@/lib/services/queries";
import { listUsers } from "@/lib/services/queries";

export const PEOPLE_ROLES: readonly Role[] = ["warehouse", "manager", "logistics", "admin"] as const;

export const DEFAULT_ROLE_LABELS: Record<Role, string> = {
  warehouse: "Склад",
  logistics: "Логистика",
  manager: "Менеджер",
  admin: "Администратор",
};

const ROLE_LABEL_PREFIX = "role_label:";

function assertName(name: string): string {
  const next = name.trim();
  if (!next || next.length > 80) throw new DomainError("Укажите имя человека");
  return next;
}

function assertRole(role: string): Role {
  if (!(PEOPLE_ROLES as readonly string[]).includes(role)) {
    throw new DomainError("Выберите роль: склад, менеджер или логистика");
  }
  return role as Role;
}

function assertLabel(label: string): string {
  const next = label.trim();
  if (!next || next.length > 40) throw new DomainError("Укажите название роли");
  return next;
}

export function createPerson(db: Sql, input: { name: string; role: Role }): UserRow {
  const name = assertName(input.name);
  const role = assertRole(input.role);
  const id = `user_${newId().replace(/-/g, "").slice(0, 12)}`;
  db.run(`INSERT INTO users (id, name, role) VALUES (?, ?, ?)`, [id, name, role]);
  return { id, name, role };
}

export function renamePerson(db: Sql, id: string, name: string): UserRow {
  const next = assertName(name);
  const row = db.get<UserRow>(`SELECT id, name, role FROM users WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Человек не найден");
  db.run(`UPDATE users SET name = ? WHERE id = ?`, [next, id]);
  return { ...row, name: next };
}

export function setPersonRole(db: Sql, id: string, role: Role): UserRow {
  const next = assertRole(role);
  const row = db.get<UserRow>(`SELECT id, name, role FROM users WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Человек не найден");
  db.run(`UPDATE users SET role = ? WHERE id = ?`, [next, id]);
  return { ...row, role: next };
}

export function updatePerson(db: Sql, id: string, input: { name: string; role: Role }): UserRow {
  const name = assertName(input.name);
  const role = assertRole(input.role);
  const row = db.get<UserRow>(`SELECT id, name, role FROM users WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Человек не найден");
  db.run(`UPDATE users SET name = ?, role = ? WHERE id = ?`, [name, role, id]);
  return { id, name, role };
}

/** Нельзя удалить последнего человека в базе и нельзя удалить себя из UI (проверка снаружи). */
export function removePerson(db: Sql, id: string, opts?: { currentUserId?: string }): void {
  const row = db.get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Человек не найден");
  if (opts?.currentUserId && opts.currentUserId === id) {
    throw new DomainError("Нельзя удалить текущего пользователя");
  }
  const count = db.get<{ value: number }>(`SELECT COUNT(*) AS value FROM users`);
  if ((count?.value ?? 0) <= 1) throw new DomainError("Нельзя удалить последнего человека");
  db.run(`DELETE FROM users WHERE id = ?`, [id]);
}

export type RoleLabels = Record<Role, string>;

export function getRoleLabels(db: Sql): RoleLabels {
  const labels = { ...DEFAULT_ROLE_LABELS };
  for (const role of PEOPLE_ROLES) {
    const row = db.get<{ value: string }>(`SELECT value FROM ledger_meta WHERE key = ?`, [`${ROLE_LABEL_PREFIX}${role}`]);
    if (row?.value?.trim()) labels[role] = row.value.trim();
  }
  return labels;
}

export function setRoleLabel(db: Sql, role: Role, label: string): RoleLabels {
  assertRole(role);
  const next = assertLabel(label);
  db.run(
    `INSERT INTO ledger_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`${ROLE_LABEL_PREFIX}${role}`, next],
  );
  return getRoleLabels(db);
}

export function setRoleLabels(db: Sql, input: Partial<Record<Role, string>>): RoleLabels {
  for (const role of PEOPLE_ROLES) {
    const value = input[role];
    if (value === undefined) continue;
    setRoleLabel(db, role, value);
  }
  return getRoleLabels(db);
}

export function roleDisplayName(db: Sql, role: Role, fallback?: string): string {
  const labels = getRoleLabels(db);
  return labels[role] || fallback || DEFAULT_ROLE_LABELS[role];
}

export { listUsers };
