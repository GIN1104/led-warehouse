import { describe, expect, it } from "vitest";
import { formatSnapshotWhen } from "@/lib/db/ledger-snapshot";

describe("formatSnapshotWhen", () => {
  it("форматирует ISO дату", () => {
    const text = formatSnapshotWhen("2026-11-17T12:30:00.000Z", "ru");
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toBe("2026-11-17T12:30:00.000Z");
  });

  it("при битой дате возвращает исходную строку", () => {
    expect(formatSnapshotWhen("not-a-date", "en")).toBe("not-a-date");
  });
});
