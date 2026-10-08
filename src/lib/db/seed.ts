import { addDays, todayIso } from "@/lib/dates";
import type { Sql } from "@/lib/db/sql";
import { applyMovement, createOrder } from "@/lib/services/ledger";

const MANAGER_ID = "user_manager";
const WAREHOUSE_ID = "user_warehouse";
const LOC_MAIN = "loc_main";
const LOC_A = "loc_a";
const LOC_B = "loc_b";
const LOC_C = "loc_c";

export function seedIfEmpty(db: Sql): void {
  const existing = db.get<{ value: number }>(`SELECT COUNT(*) AS value FROM users`);
  if ((existing?.value ?? 0) > 0) return;

  db.run(`INSERT INTO users (id, name, role) VALUES (?, 'Алексей', 'warehouse')`, [WAREHOUSE_ID]);
  db.run(`INSERT INTO users (id, name, role) VALUES (?, 'Дмитрий', 'manager')`, [MANAGER_ID]);

  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES (?, 'Главный склад', 'warehouse', NULL)`, [LOC_MAIN]);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES (?, 'Зона A — кабинеты', 'zone', ?)`, [LOC_A, LOC_MAIN]);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES (?, 'Зона B — кабели', 'zone', ?)`, [LOC_B, LOC_MAIN]);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES (?, 'Зона C — отгрузка', 'zone', ?)`, [LOC_C, LOC_MAIN]);

  const catalog: [string, string, string, string][] = [
    ["CAB-P25", "Кабинет LED P2.5 500×500", "Кабинеты", "Арендуемый кабинет, учёт по количеству"],
    ["CAB-P39", "Кабинет LED P3.9 500×500", "Кабинеты", ""],
    ["CTL-NOVA", "Контроллер NovaStar", "Контроллеры", ""],
    ["CBL-PWR", "Кабель питания powerCON", "Кабели", ""],
    ["CBL-SIG", "Кабель сигнальный EtherCON", "Кабели", ""],
    ["CASE-FC", "Кейс flight, 8 кабинетов", "Кейсы", ""],
  ];
  for (const [id, name, category, description] of catalog) {
    db.run(
      `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES (?, ?, ?, ?, 'шт', 'quantity', ?)`,
      [id, id, name, category, description],
    );
  }

  const opening: { skuId: string; locationId: string; qty: number }[] = [
    { skuId: "CAB-P25", locationId: LOC_A, qty: 40 },
    { skuId: "CAB-P39", locationId: LOC_A, qty: 24 },
    { skuId: "CTL-NOVA", locationId: LOC_A, qty: 6 },
    { skuId: "CBL-PWR", locationId: LOC_B, qty: 80 },
    { skuId: "CBL-SIG", locationId: LOC_B, qty: 50 },
    { skuId: "CASE-FC", locationId: LOC_C, qty: 12 },
  ];
  for (const row of opening) {
    applyMovement(db, { skuId: row.skuId, locationId: row.locationId, type: "in", qty: row.qty, reason: "Начальный остаток" }, WAREHOUSE_ID);
  }

  const today = todayIso();
  createOrder(
    db,
    {
      customerName: "ООО «Сцена Про»",
      startDate: today,
      endDate: addDays(today, 2),
      notes: "Концерт на набережной",
      lines: [
        { skuId: "CAB-P25", qty: 30 },
        { skuId: "CTL-NOVA", qty: 2 },
        { skuId: "CBL-SIG", qty: 20 },
      ],
      createdAt: Date.now() - 60_000,
    },
    MANAGER_ID,
  );
  createOrder(
    db,
    {
      customerName: "Арт-группа «Поле»",
      startDate: today,
      endDate: addDays(today, 2),
      notes: "Фестиваль света. Пересекается с концертом, части кабинетов не хватает.",
      lines: [
        { skuId: "CAB-P25", qty: 20 },
        { skuId: "CASE-FC", qty: 4 },
      ],
      createdAt: Date.now() - 30_000,
    },
    MANAGER_ID,
  );
  createOrder(
    db,
    {
      customerName: "Банк «Северный»",
      startDate: addDays(today, 14),
      endDate: addDays(today, 16),
      notes: "Корпоратив. Даты не пересекаются с текущей неделей.",
      lines: [{ skuId: "CAB-P25", qty: 40 }],
      createdAt: Date.now(),
    },
    MANAGER_ID,
  );
}
