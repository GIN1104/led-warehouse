import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import { wrapSqlJs } from "@/lib/db/sqljs";
import { createOrder } from "@/lib/services/ledger";
import { getDashboard, listExternalHires } from "@/lib/services/queries";

const require = createRequire(import.meta.url);

describe("sql.js", () => {
  it("принимает ту же схему, демо-данные и заказ с нехваткой", async () => {
    const wasm = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    });
    const database = new SQL.Database();
    database.run("PRAGMA foreign_keys = ON");
    const db = wrapSqlJs(database);
    migrate(db);
    seedIfEmpty(db);

    const before = getDashboard(db);
    expect(before.skuCount).toBe(6);
    expect(before.shortageUnits).toBeGreaterThan(0);

    const created = createOrder(
      db,
      {
        customerName: "Тест проката",
        startDate: "2026-10-07",
        endDate: "2026-10-09",
        lines: [{ skuId: "CAB-P39", qty: 30 }],
      },
      "user_manager",
    );
    expect(created.shortages[0]?.qty).toBe(6);
    expect(listExternalHires(db).some((hire) => hire.orderId === created.orderId && hire.qty === 6)).toBe(true);
    database.close();
  });
});
