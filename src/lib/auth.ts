import { DomainError } from "@/lib/domain/errors";
import type { Sql } from "@/lib/db/sql";
import { getRoleStockEdit } from "@/lib/services/people";
import type { Role } from "@/lib/services/queries";

const grants: Record<Role, readonly string[]> = {
  warehouse: ["catalog.write", "location.write", "scan.write", "task.write", "people.write"],
  manager: ["catalog.write", "order.write", "hire.write", "alert.write", "task.write", "people.write"],
  logistics: [],
  admin: ["*"],
};

/** Право stock.write берётся из настроек ролей (ledger_meta), не из статического grants. */
export function can(role: Role, action: string, db?: Sql): boolean {
  if (action === "stock.write") {
    if (db) return getRoleStockEdit(db)[role];
    // Без db (редкие тесты): admin всегда, warehouse — исторический дефолт seed.
    return role === "admin" || role === "warehouse";
  }
  const list = grants[role] ?? [];
  return list.includes("*") || list.includes(action);
}

export function assertCan(role: Role, action: string, db?: Sql): void {
  if (!can(role, action, db)) throw new DomainError("Недостаточно прав для этой операции");
}

export function errorText(error: unknown): string {
  return error instanceof DomainError ? error.message : "Не удалось сохранить";
}
