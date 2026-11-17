import { describe, expect, it, beforeEach } from "vitest";
import {
  listOrderFiles,
  parseSheetLinks,
  resetOrderFilesStore,
  saveOrderFiles,
  validateNewFiles,
  validateSheetLinks,
} from "@/lib/services/order-files";

describe("order-files", () => {
  beforeEach(() => {
    resetOrderFilesStore();
  });

  it("parseSheetLinks режет пустые строки", () => {
    expect(parseSheetLinks("a\n\n b \n")).toEqual(["a", "b"]);
  });

  it("validateSheetLinks лимит и http", () => {
    expect(validateSheetLinks(["ftp://x"])).toMatch(/http/);
    expect(validateSheetLinks(Array.from({ length: 11 }, (_, i) => `https://x/${i}`))).toMatch(/10/);
    expect(validateSheetLinks(["https://docs.google.com/spreadsheets/d/1"])).toBeNull();
  });

  it("validateNewFiles считает штуки и МБ", () => {
    expect(validateNewFiles(9, [{ name: "a.png", type: "image/png", size: 100 }, { name: "b.png", type: "image/png", size: 100 }])).toMatch(
      /10/,
    );
    expect(validateNewFiles(0, [{ name: "big.bin", type: "application/octet-stream", size: 9 * 1024 * 1024 }])).toMatch(/8 МБ/);
    expect(
      validateNewFiles(0, [
        { name: "a.bin", type: "application/octet-stream", size: 6 * 1024 * 1024 },
        { name: "b.bin", type: "application/octet-stream", size: 5 * 1024 * 1024 },
      ]),
    ).toMatch(/10 МБ/);
  });

  it("listOrderFiles сидит mock и save уведомляет только новое", () => {
    const listed = listOrderFiles("ord_demo");
    expect(listed.files.length).toBeGreaterThan(0);
    expect(listed.sheetLinks.length).toBe(1);

    const saved = saveOrderFiles("ord_demo", {
      equipmentList: "Кабели",
      sheetLinksText: "https://docs.google.com/spreadsheets/d/new\nhttps://docs.google.com/spreadsheets/d/mock-packing-list/edit",
      newFiles: [{ name: "schema.png", type: "image/png", size: 1200 }],
      notifyStaff: true,
    });

    expect(saved.bundle.equipmentList).toBe("Кабели");
    expect(saved.notifiedFileIds).toHaveLength(1);
    expect(saved.notifiedLinks).toEqual(["https://docs.google.com/spreadsheets/d/new"]);
    expect(saved.bundle.files.some((f) => f.name === "schema.png" && f.notified)).toBe(true);
  });

  it("удаление ссылки без notify", () => {
    listOrderFiles("ord_demo");
    const saved = saveOrderFiles("ord_demo", {
      equipmentList: "",
      sheetLinksText: "",
      notifyStaff: true,
    });
    expect(saved.removedLinkSilent).toBe(true);
    expect(saved.notifiedLinks).toEqual([]);
  });
});
