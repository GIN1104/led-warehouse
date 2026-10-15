import { describe, expect, it } from "vitest";
import {
  normalizeHeader,
  parseMapperCsv,
  parseMapperTable,
  resolveHeaderColumn,
} from "@/lib/services/mapper-sheet";

describe("normalizeHeader", () => {
  it("схлопывает пробелы, дефисы и регистр", () => {
    expect(normalizeHeader("  QTY  ")).toBe("qty");
    expect(normalizeHeader("Кол-во")).toBe("кол_во");
    expect(normalizeHeader("Кол — во")).toBe("кол_во");
    expect(normalizeHeader("Quantity")).toBe("quantity");
    expect(normalizeHeader("Наименование")).toBe("наименование");
    expect(normalizeHeader("כמות יח׳")).toBe("כמות_יח");
  });
});

describe("resolveHeaderColumn — RU/EN/HE алиасы", () => {
  it.each([
    ["название", "name"],
    ["Наименование", "name"],
    ["Оборудование", "name"],
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
    ["כמות יח׳", "qty"],
    ["code", "code"],
    ["Артикул", "code"],
    ["קוד", "code"],
    ["категория", "category"],
    ["Группа", "category"],
    ["קטגוריה", "category"],
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

describe("parseMapperTable — без заголовков и ошибки", () => {
  it("fallback: две колонки name,qty без заголовка", () => {
    const draft = parseMapperTable([
      ["Кабель SDI", "2"],
      ["Подвес", "1"],
    ]);
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.find((l) => l.name === "Кабель SDI")?.qty).toBe(2);
  });

  it("в ошибке показывает найденные заголовки и принимаемые алиасы", () => {
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/В файле заголовки/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/Принимаются/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/qty/);
    expect(() => parseMapperCsv("foo,bar\nx,y\n")).toThrow(/"foo"/);
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
