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
  updateOwnCabinet,
  updatePerson,
} from "@/lib/services/people";
import { listUsers } from "@/lib/services/queries";

describe("справочник людей и ярлыки ролей", () => {
  it("добавляет, переименовывает и меняет роль человека", () => {
    const db = createDb();
    const person = createPerson(db, { name: "Ирина", role: "manager", email: "irina@led.local" });
    expect(listUsers(db)).toEqual([
      {
        id: person.id,
        name: "Ирина",
        role: "manager",
        email: "irina@led.local",
        phone: null,
        telegramUsername: null,
        telegramChatId: null,
      },
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

  it("удаляет человека даже если он указан водителем в перевозке", () => {
    const db = createDb();
    const manager = createPerson(db, { name: "Менеджер", role: "manager" });
    const driver = createPerson(db, { name: "turso-smoke-test", role: "warehouse" });
    db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc', 'Склад', 'warehouse', NULL)`);
    db.run(
      `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES ('SKU1', 'SKU1', 'Каб', 'x', 'шт', 'quantity', '')`,
    );
    db.run(
      `INSERT INTO stock_transfers (id, sku_id, qty, from_location_id, to_location_id, status, driver_user_id, created_at, created_by)
       VALUES ('tr1', 'SKU1', 1, 'loc', 'loc', 'planned', ?, 1, ?)`,
      [driver.id, manager.id],
    );
    removePerson(db, driver.id, { currentUserId: manager.id });
    expect(listUsers(db).find((u) => u.id === driver.id)).toBeUndefined();
    expect(db.get<{ driver: string | null }>(`SELECT driver_user_id AS driver FROM stock_transfers WHERE id = 'tr1'`)?.driver).toBeNull();
  });

  it("личный кабинет: телефон и Telegram без смены роли", () => {
    const db = createDb();
    const person = createPerson(db, { name: "Ирина", role: "manager", email: "irina@led.local" });
    const next = updateOwnCabinet(db, person.id, {
      phone: "+972500000000",
      telegramUsername: "@LedNika",
      telegramChatId: "123456789",
    });
    expect(next).toMatchObject({
      phone: "+972500000000",
      telegramUsername: "LedNika",
      telegramChatId: "123456789",
      role: "manager",
      email: "irina@led.local",
    });
    expect(() => updateOwnCabinet(db, person.id, { telegramUsername: "ab" })).toThrow(/Telegram username/);
    expect(() => updateOwnCabinet(db, person.id, { telegramChatId: "abc" })).toThrow(/chatId/);
  });

  it("сохраняет кастомные названия ролей в ledger_meta", () => {
    const db = createDb();
    expect(getRoleLabels(db).warehouse).toBe("Кладовщик");
    expect(getRoleLabels(db).driver).toBe("Водитель");
    setRoleLabel(db, "warehouse", "Складской");
    setRoleLabels(db, { manager: "Менеджер зала", logistics: "Логист", driver: "Курьер" });
    const labels = getRoleLabels(db);
    expect(labels).toMatchObject({
      warehouse: "Складской",
      manager: "Менеджер зала",
      logistics: "Логист",
      admin: "Администратор",
      driver: "Курьер",
    });
    expect(() => setRoleLabel(db, "manager", "  ")).toThrow(/название роли/);
  });
});
