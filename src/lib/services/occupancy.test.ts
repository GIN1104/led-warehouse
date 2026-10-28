import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import { wrapSqlJs } from "@/lib/db/sqljs";
import { createOrder } from "@/lib/services/ledger";
import { listSkuOccupancy } from "@/lib/services/occupancy";

const require = createRequire(import.meta.url);

async function openSeededDb() {
  const wasm = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  });
  const database = new SQL.Database();
  database.run("PRAGMA foreign_keys = ON");
  const db = wrapSqlJs(database);
  migrate(db);
  seedIfEmpty(db);
  return { db, database };
}

describe("listSkuOccupancy", () => {
  it("показывает пересечение заказов и shortage по дням", async () => {
    const { db, database } = await openSeededDb();
    createOrder(
      db,
      {
        customerName: "Alpha Event",
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        lines: [{ skuId: "CAB-P39", qty: 20 }],
      },
      "user_manager",
    );
    createOrder(
      db,
      {
        customerName: "Beta Event",
        startDate: "2026-11-02",
        endDate: "2026-11-04",
        lines: [{ skuId: "CAB-P39", qty: 20 }],
      },
      "user_manager",
    );

    const range = listSkuOccupancy(db, { startDate: "2026-11-01", endDate: "2026-11-04", skuId: "CAB-P39" });
    expect(range.days).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(range.rows).toHaveLength(1);
    const row = range.rows[0]!;
    expect(row.skuCode).toBe("CAB-P39");
    expect(row.hasShortage).toBe(true);
    const day2 = row.days.find((cell) => cell.date === "2026-11-02");
    expect(day2).toBeTruthy();
    expect(day2!.orders.length).toBe(2);
    expect(day2!.shortage).toBeGreaterThan(0);
    database.close();
  });
});
