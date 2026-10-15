import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractEventName,
  extractMetaDate,
  findHeaderRowIndex,
  isMetadataRow,
  normalizeHeader,
  parseFlexibleQty,
  parseMapperCsv,
  parseMapperTable,
  resolveHeaderColumn,
} from "@/lib/services/mapper-sheet";
import { parseMapperFile } from "@/lib/services/mapper-excel";

describe("normalizeHeader", () => {
  it("схлопывает пробелы, дефисы и регистр", () => {
    expect(normalizeHeader("  QTY  ")).toBe("qty");
    expect(normalizeHeader("Кол-во")).toBe("кол_во");
    expect(normalizeHeader("Кол — во")).toBe("кол_во");
    expect(normalizeHeader("Quantity")).toBe("quantity");
    expect(normalizeHeader("Наименование")).toBe("наименование");
    expect(normalizeHeader("כמות יח׳")).toBe("כמות_יח");
    expect(normalizeHeader("כמויות")).toBe("כמויות");
  });
});

describe("resolveHeaderColumn — RU/EN/HE алиасы", () => {
  it.each([
    ["название", "name"],
    ["Наименование", "name"],
    ["Оборудование", "name"],
    ["ציוד", "name"],
    ["Item", "name"],
    ["Description", "name"],
    ["NAME", "name"],
    ["שם", "name"],
    ["פריט", "name"],
    ["qty", "qty"],
    ["QTY", "qty"],
    ["Quantity", "qty"],
    ["количество", "qty"],
    ["Кол-во", "qty"],
    ["кол во", "qty"],
    ["כמות", "qty"],
    ["כמויות", "qty"],
    ["כמות יח׳", "qty"],
    ["code", "code"],
    ["Артикул", "code"],
    ["קוד", "code"],
    ["категория", "category"],
    ["Группа", "category"],
    ["קטגוריה", "category"],
    ["תופסות", "notes"],
  ] as const)("%s → %s", (raw, field) => {
    expect(resolveHeaderColumn(raw)).toBe(field);
  });
});

describe("parseMapperCsv — типичные RU заголовки", () => {
  it("парсит Наименование + Кол-во", () => {
    const draft = parseMapperCsv("Наименование,Кол-во\nКабель SDI,3\n");
    expect(draft.lines).toEqual([{ name: "Кабель SDI", qty: 3 }]);
  });

  it("парсит Оборудование + Quantity", () => {
    const draft = parseMapperCsv("Оборудование,Quantity\nЭкран,2\n");
    expect(draft.lines).toEqual([{ name: "Экран", qty: 2 }]);
  });

  it("парсит Item + QTY", () => {
    const draft = parseMapperCsv("Item,QTY\nПодвес,5\n");
    expect(draft.lines).toEqual([{ name: "Подвес", qty: 5 }]);
  });

  it("парсит ивритские заголовки שם + כמות", () => {
    const draft = parseMapperCsv("שם,כמות\nמסך,4\n");
    expect(draft.lines).toEqual([{ name: "Экран", qty: 4 }]);
  });
});

describe("метаданные и layout mapper Excel", () => {
  it("распознаёт строки תאריך / שם האירוע / Date:", () => {
    expect(isMetadataRow(["תאריך: 14.10.2026"])).toBe(true);
    expect(isMetadataRow(["Date: 14.10.2026"])).toBe(true);
    expect(isMetadataRow(["שם האירוע: Trask + Splesh"])).toBe(true);
    expect(isMetadataRow(["מיקום: tel aviv"])).toBe(true);
    expect(isMetadataRow(["ציוד", "Оборудование", "כמויות"])).toBe(false);
    expect(isMetadataRow(["מסך", "Экран", "18"])).toBe(false);
  });

  it("извлекает дату и название события", () => {
    expect(extractMetaDate(["תאריך: 14.10.2026"])).toBe("2026-10-14");
    expect(extractEventName(["שם האירוע: Trask + Splesh"])).toBe("Trask + Splesh");
  });

  it("parseFlexibleQty: число, +, пусто, первое целое из текста", () => {
    expect(parseFlexibleQty("18")).toEqual({ qty: 18 });
    expect(parseFlexibleQty("+")).toEqual({ qty: 1 });
    expect(parseFlexibleQty("")).toEqual({ qty: 1 });
    expect(parseFlexibleQty("Laptop*2 + BIG 6")).toEqual({ qty: 2, qtyNote: "Laptop*2 + BIG 6" });
    expect(parseFlexibleQty("22 включая 20-40м")).toEqual({ qty: 22, qtyNote: "22 включая 20-40м" });
  });

  it("пропускает תאריך и находит заголовок ציוד/Оборудование/כמויות ниже", () => {
    const rows = [
      ["תאריך: 14.10.2026"],
      [],
      ["שם האירוע: Demo"],
      [],
      ["ציוד", "Оборудование", "כמויות", "תופסות"],
      ["מסך", "Экран", "18", ""],
      ["שפרייצים", "Шпрайцы", "2", ""],
      ["תיק כלים", "Сумка с инструментами", "+", ""],
      ["תלייה", "Подвес", "", ""],
      ["מיקום: tel aviv"],
    ];
    const { headerIndex, meta } = findHeaderRowIndex(rows);
    expect(headerIndex).toBe(4);
    expect(meta.startDate).toBe("2026-10-14");
    expect(meta.customerName).toBe("Demo");

    const draft = parseMapperTable(rows);
    expect(draft.startDate).toBe("2026-10-14");
    expect(draft.customerName).toBe("Demo");
    expect(draft.lines.find((l) => l.name === "Экран")?.qty).toBe(18);
    expect(draft.lines.find((l) => l.name === "Шпрайцы")?.qty).toBe(2);
    expect(draft.lines.find((l) => l.name === "Сумка с инструментами")?.qty).toBe(1);
    expect(draft.lines.find((l) => l.name === "Подвес")?.qty).toBe(1);
  });

  it("name = B (RU), иначе A (HE→glossary)", () => {
    const draft = parseMapperTable([
      ["ציוד", "Оборудование", "כמויות"],
      ["מסך", "Экран", "3"],
      ["מחשב", "", "1"],
    ]);
    expect(draft.lines.find((l) => l.name === "Экран")?.qty).toBe(3);
    expect(draft.lines.find((l) => l.name === "Компьютер")?.qty).toBe(1);
  });

  it("длинный qty → число + note из C и D", () => {
    const draft = parseMapperTable([
      ["ציוד", "Оборудование", "כמויות", "תופסות"],
      ["כבל אופטי", "Оптический кабель", "3", "HDMI100m *2"],
      ["מחשב", "Компьютер", "Laptop*2 + BIG 6", ""],
    ]);
    const optic = draft.lines.find((l) => l.name === "Оптический кабель");
    expect(optic?.qty).toBe(3);
    expect(optic?.note).toContain("HDMI100m");
    const pc = draft.lines.find((l) => l.name === "Компьютер");
    expect(pc?.qty).toBe(2);
    expect(pc?.note).toContain("Laptop");
  });
});

describe("parseMapperTable — без заголовков и ошибки", () => {
  it("fallback: две колонки name,qty без заголовка", () => {
    const draft = parseMapperTable([
      ["Кабель SDI", "2"],
      ["Подвес", "1"],
    ]);
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.find((l) => l.name === "Кабель SDI")?.qty).toBe(2);
  });

  it("в ошибке показывает найденные заголовки, алиасы и preview строк", () => {
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/В файле заголовки/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/Принимаются/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/qty/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/"foo"/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/Первые строки файла/);
  });

  it("ошибка на одной строке תאריך показывает preview", () => {
    expect(() => parseMapperTable([["תאריך: 14.10.2026"]])).toThrow(/Первые строки файла/);
    expect(() => parseMapperTable([["תאריך: 14.10.2026"]])).toThrow(/תאריך/);
  });
});

describe("glossary HE→RU при импорте", () => {
  it("переводит HE имена в русские display names", () => {
    const draft = parseMapperCsv("שם,כמות\nמסך,2\nמחשב,1\n");
    expect(draft.lines.map((l) => l.name).sort()).toEqual(["Компьютер", "Экран"]);
  });

  it("один HE и тот же RU дают один ключ в одном файле", () => {
    const draft = parseMapperCsv("name,qty\nמסך,2\nЭкран,3\n");
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]?.name).toBe("Экран");
    expect(draft.lines[0]?.qty).toBe(5);
  });
});

describe("fixture equipment-list-Trask-Splesh.xlsx", () => {
  it("импортирует образец mapper без ошибки столбцов", async () => {
    const path = resolve(process.cwd(), "examples/equipment-list-Trask-Splesh.xlsx");
    const buffer = readFileSync(path);
    const file = new File([buffer], "equipment-list-Trask-Splesh.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const draft = await parseMapperFile(file);
    expect(draft.customerName).toMatch(/Trask/i);
    expect(draft.startDate).toBe("2026-10-12");
    expect(draft.lines.length).toBeGreaterThanOrEqual(20);
    expect(draft.lines.find((l) => l.name === "Экран")).toBeTruthy();
    expect(draft.lines.find((l) => l.name === "Шпрайцы")?.qty).toBe(18);
    expect(draft.lines.find((l) => l.name === "Тросы для подвеса")?.qty).toBe(12);
    expect(draft.lines.find((l) => l.name === "Сумка с инструментами")?.qty).toBe(1);
    // Не должно бросать «Не удалось сопоставить столбцы»
    expect(draft.lines.every((l) => l.qty > 0)).toBe(true);
  });
});
