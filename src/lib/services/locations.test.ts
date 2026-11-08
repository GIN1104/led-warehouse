import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { createLocation, deleteLocation, updateLocation } from "@/lib/services/ledger";
import { listLocations } from "@/lib/services/queries";

function setup() {
  const db = createDb();
  db.run(`INSERT INTO users (id, name, role) VALUES ('wh', 'Алексей', 'warehouse')`);
  db.run(`INSERT INTO locations (id, name, kind, parent_id) VALUES ('loc_main', 'Главный склад', 'warehouse', NULL)`);
  return db;
}

describe("локации: объекты и карта", () => {
  it("создаёт объект с адресом и координатами", () => {
    const db = setup();
    const id = createLocation(
      db,
      {
        name: "Театр Яффо",
        kind: "site",
        address: "Yefet St, Tel Aviv-Yafo",
        lat: 32.054,
        lng: 34.752,
      },
      "wh",
    );
    const row = listLocations(db).find((item) => item.id === id);
    expect(row?.address).toContain("Yefet");
    expect(row?.lat).toBeCloseTo(32.054);
    expect(row?.lng).toBeCloseTo(34.752);
  });

  it("обновляет и удаляет пустой объект", () => {
    const db = setup();
    const id = createLocation(db, { name: "Площадка А", kind: "site", address: "Haifa" }, "wh");
    updateLocation(db, id, { name: "Площадка Б", kind: "site", address: "Haifa Port", lat: 32.8, lng: 35.0 }, "wh");
    const updated = listLocations(db).find((item) => item.id === id);
    expect(updated?.name).toBe("Площадка Б");
    expect(updated?.lat).toBeCloseTo(32.8);
    deleteLocation(db, id, "wh");
    expect(listLocations(db).some((item) => item.id === id)).toBe(false);
  });

  it("не даёт широту без долготы", () => {
    const db = setup();
    expect(() => createLocation(db, { name: "Bad", kind: "site", lat: 1, lng: null }, "wh")).toThrow(/широт/i);
  });

  it("не удаляет локацию с остатком", () => {
    const db = setup();
    db.run(
      `INSERT INTO skus (id, code, name, category, unit, track_mode, description) VALUES ('CAB', 'CAB', 'Cab', 'c', 'шт', 'quantity', '')`,
    );
    db.run(`INSERT INTO stock_balances (sku_id, location_id, qty_on_hand, qty_reserved) VALUES ('CAB', 'loc_main', 3, 0)`);
    expect(() => deleteLocation(db, "loc_main", "wh")).toThrow(/остаток/i);
  });
});
