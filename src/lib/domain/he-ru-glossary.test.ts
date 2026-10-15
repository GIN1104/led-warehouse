import { describe, expect, it } from "vitest";
import {
  canonicalizeEquipmentName,
  isHebrewGlossaryName,
  normalizeGlossaryKey,
} from "@/lib/domain/he-ru-glossary";
import { generateStableSkuCode, normalizeEquipmentName } from "@/lib/domain/sku-code";

describe("he-ru glossary", () => {
  it("переводит точные HE-ключи в русские названия", () => {
    expect(canonicalizeEquipmentName("מסך")).toBe("Экран");
    expect(canonicalizeEquipmentName("מחשב")).toBe("Компьютер");
    expect(canonicalizeEquipmentName("  כבל SDI  ")).toBe("Кабель SDI");
    expect(canonicalizeEquipmentName("TV")).toBe("ТВ");
    expect(canonicalizeEquipmentName("tv")).toBe("ТВ");
  });

  it("канонизирует уже русские значения словаря", () => {
    expect(canonicalizeEquipmentName("Экран")).toBe("Экран");
    expect(canonicalizeEquipmentName("экран")).toBe("Экран");
  });

  it("не трогает неизвестные названия", () => {
    expect(canonicalizeEquipmentName("Кастомный стенд")).toBe("Кастомный стенд");
  });

  it("HE и RU дают один name_key и стабильный code", () => {
    const fromHe = canonicalizeEquipmentName("מסך");
    const fromRu = canonicalizeEquipmentName("Экран");
    expect(fromHe).toBe(fromRu);
    expect(normalizeEquipmentName(fromHe)).toBe(normalizeEquipmentName(fromRu));
    expect(generateStableSkuCode(fromHe, [])).toBe(generateStableSkuCode(fromRu, []));
  });

  it("распознаёт HE-ключ", () => {
    expect(isHebrewGlossaryName("מסך")).toBe(true);
    expect(isHebrewGlossaryName("Экран")).toBe(false);
    expect(normalizeGlossaryKey("  CVT / ממיר אופטי ")).toBe(normalizeGlossaryKey("CVT / ממיר אופטי"));
  });
});
