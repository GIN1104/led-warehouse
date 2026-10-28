import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import { wrapSqlJs } from "@/lib/db/sqljs";
import { createOrder } from "@/lib/services/ledger";
import { listOpenShortages, shortageLifecycleCounts } from "@/lib/services/shortages";

const require = createRequire(import.meta.url);

describe("listOpenShortages", () => {
  it("возвращает нехватку с hire needed и lifecycle counts", async () => {
    const wasm = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    });
    const database = new SQL.Database();
    database.run("PRAGMA foreign_keys = ON");
    const db = wrapSqlJs(database);
    migrate(db);
    seedIfEmpty(db);

    createOrder(
      db,
      {
        customerName: "Shortage Demo",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        lines: [{ skuId: "CAB-P39", qty: 40 }],
      },
      "user_manager",
    );

    const rows = listOpenShortages(db);
    expect(rows.some((row) => row.skuCode === "CAB-P39" && row.qtyShortage > 0)).toBe(true);
    const hit = rows.find((row) => row.skuCode === "CAB-P39")!;
    expect(hit.hireStatus).toBe("needed");
    expect(Array.isArray(hit.alternatives)).toBe(true);

    const counts = shortageLifecycleCounts(db);
    expect(counts.openShortages).toBeGreaterThan(0);
    expect(counts.needed).toBeGreaterThan(0);
    expect(counts.shortageUnits).toBeGreaterThan(0);
    database.close();
  });
});
