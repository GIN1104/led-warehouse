import { DomainError } from "@/lib/domain/errors";
import type { Role } from "@/lib/services/queries";

const grants: Record<Role, readonly string[]> = {
  warehouse: ["catalog.write", "location.write", "stock.write", "scan.write", "task.write"],
  manager: ["catalog.write", "order.write", "hire.write", "alert.write", "task.write"],
  logistics: [],
  admin: ["*"],
};

export function can(role: Role, action: string): boolean {
  const list = grants[role] ?? [];
  return list.includes("*") || list.includes(action);
}

export function assertCan(role: Role, action: string): void {
  if (!can(role, action)) throw new DomainError("Недостаточно прав для этой операции");
}

export function errorText(error: unknown): string {
  return error instanceof DomainError ? error.message : "Не удалось сохранить";
}
