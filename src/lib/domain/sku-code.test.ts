import { describe, expect, it } from "vitest";
import {
  generateStableSkuCode,
  normalizeEquipmentName,
  shortNameHash,
  suggestSkuCode,
} from "@/lib/domain/sku-code";

describe("нормализация названия оборудования", () => {
  it("обрезает пробелы, приводит регистр и схлопывает пробелы", () => {
    expect(normalizeEquipmentName("  TV  32\"  ")).toBe('tv 32"');
    expect(normalizeEquipmentName("Телевизор\t40\"")).toBe('телевизор 40"');
    expect(normalizeEquipmentName("LED   P2.5")).toBe("led p2.5");
  });

  it("одинаковое имя с разным регистром даёт один ключ", () => {
    expect(normalizeEquipmentName("TV 32\"")).toBe(normalizeEquipmentName("tv 32\""));
    expect(normalizeEquipmentName("Телевизор 50\"")).toBe(normalizeEquipmentName("телевизор 50\""));
  });
});

describe("генерация code", () => {
  it("предлагает человекочитаемый TV-N для телевизоров", () => {
    expect(suggestSkuCode('TV 32"')).toBe("TV-32");
    expect(suggestSkuCode("Телевизор 40\"")).toBe("TV-40");
    expect(suggestSkuCode("телевизор 50 дюйм")).toBe("TV-50");
  });

  it("стабилен: одно имя → один и тот же code", () => {
    const a = generateStableSkuCode('TV 32"', []);
    const b = generateStableSkuCode("  tv   32\" ", []);
    expect(a).toBe("TV-32");
    expect(b).toBe(a);
  });

  it("при занятом code добавляет хеш имени, но для того же имени без taken — базовый", () => {
    const first = generateStableSkuCode("Кабель питания", []);
    expect(first.length).toBeGreaterThanOrEqual(2);
    const collision = generateStableSkuCode("Другой кабель", [first]);
    expect(collision).not.toBe(first);
    expect(generateStableSkuCode("Кабель питания", [first])).not.toBe(first);
    // хеш имени стабилен
    expect(shortNameHash(normalizeEquipmentName("Кабель питания"), 4)).toHaveLength(4);
  });

  it("кабинет → CAB-P…", () => {
    expect(suggestSkuCode("Кабинет LED P2.5 500×500")).toMatch(/^CAB-P25/);
  });
});
