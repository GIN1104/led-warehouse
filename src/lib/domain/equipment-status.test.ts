import { describe, expect, it } from "vitest";
import { canTransitionEquipment, isEquipmentStatus } from "@/lib/domain/equipment-status";

describe("статусы оборудования", () => {
  it("распознаёт канонические статусы", () => {
    expect(isEquipmentStatus("available")).toBe(true);
    expect(isEquipmentStatus("reserved")).toBe(true);
    expect(isEquipmentStatus("checked_out")).toBe(true);
    expect(isEquipmentStatus("needs_repair")).toBe(true);
    expect(isEquipmentStatus("in_repair")).toBe(true);
    expect(isEquipmentStatus("lost")).toBe(false);
  });

  it("разрешает ручной checkout и ремонт без сканера", () => {
    expect(canTransitionEquipment("reserved", "checked_out")).toBe(true);
    expect(canTransitionEquipment("available", "needs_repair")).toBe(true);
    expect(canTransitionEquipment("needs_repair", "in_repair")).toBe(true);
    expect(canTransitionEquipment("in_repair", "available")).toBe(true);
    expect(canTransitionEquipment("checked_out", "reserved")).toBe(false);
  });
});
