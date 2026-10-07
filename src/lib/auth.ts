import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain/errors";

export type Role = "warehouse" | "logistics" | "manager" | "admin";

const grants: Record<Role, readonly string[]> = {
  warehouse: ["catalog.write", "location.write", "stock.write", "scan.write"],
  manager: ["catalog.write", "order.write", "hire.write", "alert.write"],
  logistics: [],
  admin: ["*"],
};

export function can(role: Role, action: string): boolean {
  const list = grants[role] ?? [];
  return list.includes("*") || list.includes(action);
}

export async function getSession() {
  const db = getDb();
  const jar = await cookies();
  const id = jar.get("lw_user")?.value;
  const picked = id ? db.select().from(users).where(eq(users.id, id)).get() : undefined;
  const user =
    picked ?? db.select().from(users).where(eq(users.role, "manager")).get() ?? db.select().from(users).all()[0];
  if (!user) throw new DomainError("В базе нет пользователей");
  return user;
}

export function assertCan(role: Role, action: string): void {
  if (!can(role, action)) throw new DomainError("Недостаточно прав для этой операции");
}
