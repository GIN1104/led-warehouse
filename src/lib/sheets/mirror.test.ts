import { describe, expect, it, vi } from "vitest";
import { createDb } from "@/lib/db/memory";
import { seedIfEmpty } from "@/lib/db/seed";
import { buildSheetsMirrorSnapshot, pushSheetsMirror } from "@/lib/sheets/mirror";

describe("Sheets mirror snapshot", () => {
  it("собирает таблицы без секрета — mock push", async () => {
    const db = createDb();
    seedIfEmpty(db);
    const snap = buildSheetsMirrorSnapshot(db);
    expect(snap.source).toBe("led-warehouse-sqlite");
    expect(snap.tables.users.length).toBeGreaterThan(0);
    expect(snap.tables.locations.some((row) => row.kind === "site")).toBe(true);
    const mock = await pushSheetsMirror(snap, { webhookUrl: "" });
    expect(mock.mode).toBe("mock");
  });

  it("с webhook — sent", async () => {
    const db = createDb();
    seedIfEmpty(db);
    const snap = buildSheetsMirrorSnapshot(db);
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const result = await pushSheetsMirror(snap, {
      webhookUrl: "https://example.test/mirror",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.mode).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
