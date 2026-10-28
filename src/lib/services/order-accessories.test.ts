import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/migrate";
import { seedIfEmpty } from "@/lib/db/seed";
import { wrapSqlJs } from "@/lib/db/sqljs";
import { createOrder } from "@/lib/services/ledger";
import {
  cancelOrderAccessory,
  listOrderAccessories,
  setOrderAccessoryAssembled,
} from "@/lib/services/order-accessories";
import { listKitSubtypesBySkuId } from "@/lib/services/kits";

const require = createRequire(import.meta.url);

describe("order-accessories", () => {
  it("auto-add из kit Laptop при создании заказа; assembled и cancel", async () => {
    const wasm = readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
    const SQL = await initSqlJs({
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    });
    const database = new SQL.Database();
    database.run("PRAGMA foreign_keys = ON");
    const db = wrapSqlJs(database);
    migrate(db);
    seedIfEmpty(db);

    const laptop = [...listKitSubtypesBySkuId(db).values()].find((row) => /laptop/i.test(row.name));
    expect(laptop?.skuId).toBeTruthy();

    const created = createOrder(
      db,
      {
        customerName: "Kit Order",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        lines: [{ skuId: laptop!.skuId!, qty: 2 }],
      },
      "user_manager",
    );

    const accessories = listOrderAccessories(db, created.orderId);
    expect(accessories.length).toBeGreaterThan(0);
    expect(accessories.every((row) => !row.cancelled)).toBe(true);
    // qty шаблона × 2
    const hdmi = accessories.find((row) => /hdmi/i.test(row.label));
    expect(hdmi).toBeTruthy();
    expect(hdmi!.qty).toBeGreaterThanOrEqual(2);

    setOrderAccessoryAssembled(db, hdmi!.id, true);
    expect(listOrderAccessories(db, created.orderId).find((row) => row.id === hdmi!.id)?.assembled).toBe(true);

    cancelOrderAccessory(db, hdmi!.id);
    expect(listOrderAccessories(db, created.orderId).find((row) => row.id === hdmi!.id)?.cancelled).toBe(true);
    database.close();
  });
});
