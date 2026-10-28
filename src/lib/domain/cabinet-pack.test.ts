import { describe, expect, it } from "vitest";
import {
  cabinetPackFromText,
  cabinetPackMetrics,
  detectCabinetForm,
  formatCabinetPack,
} from "@/lib/domain/cabinet-pack";

describe("cabinet-pack", () => {
  it("500×500 → 8 в кейсе, м² = 0.25×n", () => {
    expect(detectCabinetForm("Кабинет LED P2.5 500×500")).toBe("500x500");
    const m = cabinetPackMetrics(10, "500x500");
    expect(m.perCase).toBe(8);
    expect(m.cases).toBe(2); // ceil(10/8)
    expect(m.squareMeters).toBe(2.5);
  });

  it("1000×500 → 6 в кейсе", () => {
    expect(detectCabinetForm("Cabinet 1000x500")).toBe("1000x500");
    const m = cabinetPackMetrics(7, "1000x500");
    expect(m.perCase).toBe(6);
    expect(m.cases).toBe(2); // ceil(7/6)
    expect(m.squareMeters).toBe(3.5);
  });

  it("полный кейс без округления вверх лишнего", () => {
    expect(cabinetPackMetrics(8, "500x500").cases).toBe(1);
    expect(cabinetPackMetrics(6, "1000x500").cases).toBe(1);
    expect(cabinetPackMetrics(0, "500x500").cases).toBe(0);
  });

  it("formatCabinetPack и fromText", () => {
    const m = cabinetPackFromText(16, "CAB 500x500");
    expect(m?.cases).toBe(2);
    expect(formatCabinetPack(m!)).toContain("4");
    expect(formatCabinetPack(m!)).toContain("16");
    expect(formatCabinetPack(m!)).toContain("2");
  });
});
