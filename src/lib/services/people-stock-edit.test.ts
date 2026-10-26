import { describe, expect, it } from "vitest";
import { assertCan, can } from "@/lib/auth";
import { createDb } from "@/lib/db/memory";
import {
  ensureDefaultRoleStockEdit,
  getRoleStockEdit,
  setRoleStockEdit,
} from "@/lib/services/people";

describe("право редактировать склад по ролям", () => {
  it("seed: admin и warehouse включены, manager/logistics выключены", () => {
    const db = createDb();
    const flags = ensureDefaultRoleStockEdit(db);
    expect(flags).toMatchObject({
      admin: true,
      warehouse: true,
      manager: false,
      logistics: false,
    });
  });

  it("can(stock.write) читает флаги из БД", () => {
    const db = createDb();
    expect(can("manager", "stock.write", db)).toBe(false);
    expect(can("warehouse", "stock.write", db)).toBe(true);
    expect(can("admin", "stock.write", db)).toBe(true);

    setRoleStockEdit(db, { manager: true, warehouse: false });
    expect(can("manager", "stock.write", db)).toBe(true);
    expect(can("warehouse", "stock.write", db)).toBe(false);
    expect(() => assertCan("warehouse", "stock.write", db)).toThrow(/прав/);
  });

  it("повторный ensure не затирает ручные настройки", () => {
    const db = createDb();
    setRoleStockEdit(db, { warehouse: false, logistics: true });
    ensureDefaultRoleStockEdit(db);
    expect(getRoleStockEdit(db)).toMatchObject({
      warehouse: false,
      logistics: true,
      admin: true,
    });
  });
});
