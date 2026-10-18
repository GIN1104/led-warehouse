import { describe, expect, it } from "vitest";
import {
  buildDriveExcelFileName,
  driveFileNameFromMapperDraft,
  formatDriveDateStamp,
  sanitizeDriveEventName,
} from "@/lib/google/drive-filename";

describe("formatDriveDateStamp", () => {
  it("ставит день-месяц-год с дефисами", () => {
    expect(formatDriveDateStamp("2026-10-18")).toBe("18-10-2026");
    expect(formatDriveDateStamp("2026-01-05")).toBe("05-01-2026");
  });

  it("отклоняет не-ISO", () => {
    expect(() => formatDriveDateStamp("18-10-2026")).toThrow(/ГГГГ-ММ-ДД/);
    expect(() => formatDriveDateStamp("2026/10/18")).toThrow(/ГГГГ-ММ-ДД/);
  });
});

describe("buildDriveExcelFileName", () => {
  it("дата первая, без события — только штамп и расширение", () => {
    expect(buildDriveExcelFileName({ date: "2026-10-18" })).toBe("18-10-2026.xlsx");
  });

  it("событие после даты через пробел", () => {
    expect(buildDriveExcelFileName({ date: "2026-10-18", eventName: "Имя события" })).toBe(
      "18-10-2026 Имя события.xlsx",
    );
    expect(buildDriveExcelFileName({ date: "2026-10-18", eventName: "Trask Splesh" })).toBe(
      "18-10-2026 Trask Splesh.xlsx",
    );
  });

  it("чистит опасные символы в названии события", () => {
    expect(buildDriveExcelFileName({ date: "2026-10-18", eventName: 'A/B: "тест"*.xlsx' })).toBe(
      "18-10-2026 A B тест.xlsx",
    );
  });

  it("принимает расширение без точки и пустое событие", () => {
    expect(buildDriveExcelFileName({ date: "2026-10-18", eventName: "  ", extension: "csv" })).toBe(
      "18-10-2026.csv",
    );
  });
});

describe("sanitizeDriveEventName", () => {
  it("схлопывает пробелы и обрезает хвост из точек", () => {
    expect(sanitizeDriveEventName("  Demo   Event.  ")).toBe("Demo Event");
  });
});

describe("driveFileNameFromMapperDraft", () => {
  it("берёт startDate и customerName", () => {
    expect(
      driveFileNameFromMapperDraft({ startDate: "2026-10-18", customerName: "Trask Splesh" }),
    ).toBe("18-10-2026 Trask Splesh.xlsx");
  });
});
