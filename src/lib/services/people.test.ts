import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import {
  createPerson,
  getRoleLabels,
  removePerson,
  renamePerson,
  setPersonRole,
  setRoleLabel,
  setRoleLabels,
  updatePerson,
} from "@/lib/services/people";
import { listUsers } from "@/lib/services/queries";

describe("справочник людей и ярлыки ролей", () => {
  it("добавляет, переименовывает и меняет роль человека", () => {
    const db = createDb();
    const person = createPerson(db, { name: "Ирина", role: "manager", email: "irina@led.local" });
    expect(listUsers(db)).toEqual([
      { id: person.id, name: "Ирина", role: "manager", email: "irina@led.local" },
    ]);

    renamePerson(db, person.id, "Ирина К.");
    expect(listUsers(db)[0]?.name).toBe("Ирина К.");

    setPersonRole(db, person.id, "warehouse");
    expect(listUsers(db)[0]?.role).toBe("warehouse");

    updatePerson(db, person.id, { name: "Олег", role: "logistics", email: "oleg@led.local" });
    expect(listUsers(db)[0]).toMatchObject({ name: "Олег", role: "logistics", email: "oleg@led.local" });
  });

  it("не даёт дублировать email", () => {
    const db = createDb();
    createPerson(db, { name: "А", role: "warehouse", email: "same@led.local" });
    expect(() => createPerson(db, { name: "Б", role: "manager", email: "same@led.local" })).toThrow(/email/);
  });

  it("не даёт пустое имя, неизвестную роль и удаление последнего", () => {
    const db = createDb();
    const alone = createPerson(db, { name: "Алексей", role: "warehouse" });
    expect(() => createPerson(db, { name: "  ", role: "manager" })).toThrow(/имя/);
    expect(() => createPerson(db, { name: "Пётр", role: "guest" as "manager" })).toThrow(/роль/);
    expect(() => removePerson(db, alone.id)).toThrow(/последнего/);

    const second = createPerson(db, { name: "Дмитрий", role: "manager" });
    expect(() => removePerson(db, second.id, { currentUserId: second.id })).toThrow(/текущего/);
    removePerson(db, second.id, { currentUserId: alone.id });
    expect(listUsers(db)).toHaveLength(1);
  });

  it("сохраняет кастомные названия ролей в ledger_meta", () => {
    const db = createDb();
    expect(getRoleLabels(db).warehouse).toBe("Склад");
    setRoleLabel(db, "warehouse", "Кладовщик");
    setRoleLabels(db, { manager: "Менеджер зала", logistics: "Водитель" });
    const labels = getRoleLabels(db);
    expect(labels).toMatchObject({
      warehouse: "Кладовщик",
      manager: "Менеджер зала",
      logistics: "Водитель",
      admin: "Администратор",
    });
    expect(() => setRoleLabel(db, "manager", "  ")).toThrow(/название роли/);
  });
});
