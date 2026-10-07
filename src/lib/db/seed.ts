import { count } from "drizzle-orm";
import { addDays, todayIso } from "@/lib/dates";
import type { AppDb } from "@/lib/db/types";
import { locations, skus, users } from "@/lib/db/schema";
import { applyMovement, createOrder } from "@/lib/services/ledger";

const MANAGER_ID = "user_manager";
const WAREHOUSE_ID = "user_warehouse";
const LOC_MAIN = "loc_main";
const LOC_A = "loc_a";
const LOC_B = "loc_b";
const LOC_C = "loc_c";

export function seedIfEmpty(db: AppDb): void {
  const existing = db.select({ value: count() }).from(users).get();
  if ((existing?.value ?? 0) > 0) return;

  db.insert(users)
    .values([
      { id: WAREHOUSE_ID, name: "Алексей", role: "warehouse" },
      { id: MANAGER_ID, name: "Мария", role: "manager" },
    ])
    .run();

  db.insert(locations)
    .values([
      { id: LOC_MAIN, name: "Главный склад", kind: "warehouse", parentId: null },
      { id: LOC_A, name: "Зона A — кабинеты", kind: "zone", parentId: LOC_MAIN },
      { id: LOC_B, name: "Зона B — кабели", kind: "zone", parentId: LOC_MAIN },
      { id: LOC_C, name: "Зона C — отгрузка", kind: "zone", parentId: LOC_MAIN },
    ])
    .run();

  db.insert(skus)
    .values([
      {
        id: "CAB-P25",
        code: "CAB-P25",
        name: "Кабинет LED P2.5 500×500",
        category: "Кабинеты",
        unit: "шт",
        trackMode: "quantity",
        description: "Арендуемый кабинет, учёт по количеству",
      },
      {
        id: "CAB-P39",
        code: "CAB-P39",
        name: "Кабинет LED P3.9 500×500",
        category: "Кабинеты",
        unit: "шт",
        trackMode: "quantity",
        description: "",
      },
      {
        id: "CTL-NOVA",
        code: "CTL-NOVA",
        name: "Контроллер NovaStar",
        category: "Контроллеры",
        unit: "шт",
        trackMode: "quantity",
        description: "",
      },
      {
        id: "CBL-PWR",
        code: "CBL-PWR",
        name: "Кабель питания powerCON",
        category: "Кабели",
        unit: "шт",
        trackMode: "quantity",
        description: "",
      },
      {
        id: "CBL-SIG",
        code: "CBL-SIG",
        name: "Кабель сигнальный EtherCON",
        category: "Кабели",
        unit: "шт",
        trackMode: "quantity",
        description: "",
      },
      {
        id: "CASE-FC",
        code: "CASE-FC",
        name: "Кейс flight, 8 кабинетов",
        category: "Кейсы",
        unit: "шт",
        trackMode: "quantity",
        description: "",
      },
    ])
    .run();

  const opening: { skuId: string; locationId: string; qty: number }[] = [
    { skuId: "CAB-P25", locationId: LOC_A, qty: 40 },
    { skuId: "CAB-P39", locationId: LOC_A, qty: 24 },
    { skuId: "CTL-NOVA", locationId: LOC_A, qty: 6 },
    { skuId: "CBL-PWR", locationId: LOC_B, qty: 80 },
    { skuId: "CBL-SIG", locationId: LOC_B, qty: 50 },
    { skuId: "CASE-FC", locationId: LOC_C, qty: 12 },
  ];
  for (const row of opening) {
    applyMovement(
      db,
      {
        skuId: row.skuId,
        locationId: row.locationId,
        type: "in",
        qty: row.qty,
        reason: "Начальный остаток",
      },
      WAREHOUSE_ID,
    );
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
