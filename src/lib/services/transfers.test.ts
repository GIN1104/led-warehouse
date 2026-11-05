import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { seedIfEmpty } from "@/lib/db/seed";
import { cancelTransfer, listTransfers, planTransfer, receiveTransfer, shipTransfer } from "@/lib/services/transfers";

describe("перемещения склад↔объект", () => {
  it("план → отправка → приём меняет остатки", () => {
    const db = createDb();
    seedIfEmpty(db);
    const from = "loc_a";
    const to = "loc_site_embankment";
    const before =
      db.get<{ qty: number }>(`SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = 'CAB-P25' AND location_id = ?`, [
        from,
      ])?.qty ?? 0;

    const planned = planTransfer(
      db,
      { skuId: "CAB-P25", qty: 5, fromLocationId: from, toLocationId: to, driverUserId: "user_driver" },
      "user_warehouse",
    );
    expect(planned.status).toBe("planned");

    shipTransfer(db, planned.id, "user_warehouse");
    const midFrom =
      db.get<{ qty: number }>(`SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = 'CAB-P25' AND location_id = ?`, [
        from,
      ])?.qty ?? 0;
    expect(midFrom).toBe(before - 5);
    expect(listTransfers(db)[0]?.status).toBe("in_transit");

    receiveTransfer(db, planned.id, "user_driver");
    const atSite =
      db.get<{ qty: number }>(`SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = 'CAB-P25' AND location_id = ?`, [
        to,
      ])?.qty ?? 0;
    expect(atSite).toBe(5);
    expect(listTransfers(db).find((row) => row.id === planned.id)?.status).toBe("received");
  });

  it("объект↔объект и отмена из in_transit возвращает qty", () => {
    const db = createDb();
    seedIfEmpty(db);
    const first = planTransfer(
      db,
      {
        skuId: "CAB-P25",
        qty: 3,
        fromLocationId: "loc_a",
        toLocationId: "loc_site_embankment",
      },
      "user_warehouse",
    );
    shipTransfer(db, first.id, "user_warehouse");
    receiveTransfer(db, first.id, "user_warehouse");

    const hop = planTransfer(
      db,
      {
        skuId: "CAB-P25",
        qty: 2,
        fromLocationId: "loc_site_embankment",
        toLocationId: "loc_site_field",
      },
      "user_warehouse",
    );
    shipTransfer(db, hop.id, "user_driver");
    cancelTransfer(db, hop.id, "user_warehouse");
    const back =
      db.get<{ qty: number }>(
        `SELECT qty_on_hand AS qty FROM stock_balances WHERE sku_id = 'CAB-P25' AND location_id = 'loc_site_embankment'`,
      )?.qty ?? 0;
    expect(back).toBe(3);
    expect(listTransfers(db).find((row) => row.id === hop.id)?.status).toBe("cancelled");
  });
});
